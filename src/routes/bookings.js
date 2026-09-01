const express = require('express');
const prisma = require('../lib/prisma');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// POST /bookings - book seats on a trip (customer only)
router.post('/', requireAuth, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const { tripId, seats } = req.body;
    const seatsRequested = Number(seats);

    if (!tripId || !seatsRequested || seatsRequested < 1) {
      return res.status(400).json({ error: 'tripId and a valid number of seats are required' });
    }

    const booking = await prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });

      if (!trip || trip.status !== 'PUBLISHED') {
        throw new Error('TRIP_NOT_FOUND');
      }

      const maxAllowedBookedBefore = trip.totalSeats - seatsRequested;

      // This single atomic update is what prevents overbooking:
      // it only succeeds if seatsBooked is still low enough to fit this request.
      const updateResult = await tx.trip.updateMany({
        where: {
          id: tripId,
          seatsBooked: { lte: maxAllowedBookedBefore },
        },
        data: {
          seatsBooked: { increment: seatsRequested },
        },
      });

      if (updateResult.count === 0) {
        throw new Error('NOT_ENOUGH_SEATS');
      }

      const totalPrice = trip.pricePerSeat * seatsRequested;

      return tx.booking.create({
        data: {
          tripId,
          customerId: req.user.userId,
          seatsBooked: seatsRequested,
          totalPrice,
          status: 'CONFIRMED',
        },
      });
    });

    res.status(201).json({ booking });
  } catch (err) {
    if (err.message === 'TRIP_NOT_FOUND') {
      return res.status(404).json({ error: 'Trip not found or no longer available' });
    }
    if (err.message === 'NOT_ENOUGH_SEATS') {
      return res.status(409).json({ error: 'Not enough seats available' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the booking' });
  }
});

// GET /bookings/mine - customer's own bookings
router.get('/mine', requireAuth, requireRole('CUSTOMER'), async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { customerId: req.user.userId },
    include: {
      trip: { include: { provider: { select: { name: true } }, vehicle: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ bookings });
});

module.exports = router;
