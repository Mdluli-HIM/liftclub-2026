const express = require('express');
const prisma = require('../lib/prisma');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

router.post('/', requireAuth, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const { tripId, seats, pickupLocation, dropoffLocation, passengerName, passengerPhone } = req.body;
    const seatsRequested = Number(seats);

    if (!tripId || !seatsRequested || seatsRequested < 1) {
      return res.status(400).json({ error: 'tripId and a valid number of seats are required' });
    }
    if (!pickupLocation || !pickupLocation.trim()) {
      return res.status(400).json({ error: 'A pickup location is required' });
    }
    if (!dropoffLocation || !dropoffLocation.trim()) {
      return res.status(400).json({ error: 'A drop-off location is required' });
    }
    if (!passengerPhone || !passengerPhone.trim()) {
      return res.status(400).json({ error: 'A contact phone number is required so the driver can reach you' });
    }

    const customer = await prisma.user.findUnique({ where: { id: req.user.userId } });

    const booking = await prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });

      if (!trip || trip.status !== 'PUBLISHED') {
        throw new Error('TRIP_NOT_FOUND');
      }

      const maxAllowedBookedBefore = trip.totalSeats - seatsRequested;

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

      // Full driver/vehicle identity is included here, and only here (plus /bookings/mine) -
      // this is the moment the customer has actually paid, so the reveal is earned.
      return tx.booking.create({
        data: {
          tripId,
          customerId: req.user.userId,
          seatsBooked: seatsRequested,
          totalPrice,
          status: 'CONFIRMED',
          pickupLocation: pickupLocation.trim(),
          dropoffLocation: dropoffLocation.trim(),
          passengerName: (passengerName && passengerName.trim()) || customer.name,
          passengerPhone: passengerPhone.trim(),
        },
        include: {
          trip: {
            include: {
              provider: { select: { name: true } },
              vehicle: true,
            },
          },
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
