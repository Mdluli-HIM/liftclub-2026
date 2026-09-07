const express = require('express');
const prisma = require('../lib/prisma');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { toTitleCase, CITY_NAME_REGEX } = require('../lib/normalize');

const router = express.Router();

router.post('/', requireAuth, requireRole('PROVIDER'), async (req, res) => {
  try {
    const { vehicleId, originCity, destinationCity, departureTime, pricePerSeat, totalSeats } = req.body;

    if (!vehicleId || !originCity || !destinationCity || !departureTime || !pricePerSeat || !totalSeats) {
      return res.status(400).json({ error: 'vehicleId, originCity, destinationCity, departureTime, pricePerSeat, and totalSeats are required' });
    }

    if (!CITY_NAME_REGEX.test(originCity.trim()) || !CITY_NAME_REGEX.test(destinationCity.trim())) {
      return res.status(400).json({ error: 'City names should only contain letters, spaces, and hyphens (2-50 characters)' });
    }

    const seatsRequested = Number(totalSeats);
    const price = Number(pricePerSeat);

    if (!Number.isInteger(seatsRequested) || seatsRequested < 1) {
      return res.status(400).json({ error: 'totalSeats must be a whole number of at least 1' });
    }

    if (!(price > 0)) {
      return res.status(400).json({ error: 'pricePerSeat must be a positive number' });
    }

    const departureDate = new Date(departureTime);
    if (isNaN(departureDate.getTime()) || departureDate < new Date()) {
      return res.status(400).json({ error: 'departureTime must be a valid date in the future' });
    }

    const provider = await prisma.user.findUnique({ where: { id: req.user.userId } });

    if (provider.verificationStatus !== 'APPROVED') {
      if (provider.verificationStatus === 'REJECTED') {
        return res.status(403).json({
          error: 'Your provider account was not approved' + (provider.rejectionReason ? ': ' + provider.rejectionReason : '') + '. Please update your documents and try again.',
        });
      }
      return res.status(403).json({ error: 'Your provider account is pending verification. An admin needs to approve you before you can post trips.' });
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle || vehicle.providerId !== req.user.userId) {
      return res.status(403).json({ error: 'This vehicle does not belong to you' });
    }

    if (seatsRequested > vehicle.seatCapacity) {
      return res.status(400).json({
        error: 'totalSeats (' + seatsRequested + ') cannot exceed this vehicle\'s seat capacity (' + vehicle.seatCapacity + ')',
      });
    }

    const trip = await prisma.trip.create({
      data: {
        providerId: req.user.userId,
        vehicleId,
        originCity: toTitleCase(originCity),
        destinationCity: toTitleCase(destinationCity),
        departureTime: departureDate,
        pricePerSeat: price,
        totalSeats: seatsRequested,
      },
    });

    res.status(201).json({ trip });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the trip' });
  }
});

// GET /trips/search - PUBLIC. Deliberately hides driver identity and vehicle
// make/model/photo/registration. Only route, timing, price, seats, and
// amenities are shown before a booking is confirmed.
router.get('/search', async (req, res) => {
  try {
    const { origin, destination, date, seats } = req.query;
    const requestedSeats = seats ? Number(seats) : 1;

    const where = { status: 'PUBLISHED' };
    if (origin) where.originCity = { contains: origin.trim(), mode: 'insensitive' };
    if (destination) where.destinationCity = { contains: destination.trim(), mode: 'insensitive' };
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.departureTime = { gte: startOfDay, lte: endOfDay };
    }

    const trips = await prisma.trip.findMany({
      where,
      select: {
        id: true,
        originCity: true,
        destinationCity: true,
        departureTime: true,
        pricePerSeat: true,
        totalSeats: true,
        seatsBooked: true,
        status: true,
        createdAt: true,
        vehicle: { select: { amenities: true } },
      },
      orderBy: { departureTime: 'asc' },
    });

    const available = trips.filter((t) => t.totalSeats - t.seatsBooked >= requestedSeats);
    res.json({ trips: available });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong searching trips' });
  }
});

router.get('/mine', requireAuth, requireRole('PROVIDER'), async (req, res) => {
  const trips = await prisma.trip.findMany({
    where: { providerId: req.user.userId },
    include: { vehicle: true },
    orderBy: { departureTime: 'asc' },
  });
  res.json({ trips });
});

router.get('/date-prices', async (req, res) => {
  try {
    const { origin, destination, seats, date } = req.query;
    const requestedSeats = seats ? Number(seats) : 1;

    const centerDate = date ? new Date(date) : new Date();
    if (isNaN(centerDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date' });
    }

    const DAYS = 7;
    const rangeStart = new Date(centerDate);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + DAYS);

    const where = {
      status: 'PUBLISHED',
      departureTime: { gte: rangeStart, lt: rangeEnd },
    };
    if (origin) where.originCity = { contains: origin.trim(), mode: 'insensitive' };
    if (destination) where.destinationCity = { contains: destination.trim(), mode: 'insensitive' };

    const trips = await prisma.trip.findMany({
      where,
      select: { departureTime: true, pricePerSeat: true, totalSeats: true, seatsBooked: true },
    });

    const byDate = {};
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(rangeStart);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      byDate[key] = { date: key, minPrice: null, hasTrips: false };
    }

    trips.forEach((t) => {
      const seatsLeft = t.totalSeats - t.seatsBooked;
      if (seatsLeft < requestedSeats) return;
      const key = t.departureTime.toISOString().slice(0, 10);
      if (!byDate[key]) return;
      byDate[key].hasTrips = true;
      if (byDate[key].minPrice === null || t.pricePerSeat < byDate[key].minPrice) {
        byDate[key].minPrice = t.pricePerSeat;
      }
    });

    res.json({ prices: Object.values(byDate) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading date prices' });
  }
});

router.get('/:id/passengers', requireAuth, requireRole('PROVIDER'), async (req, res) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip || trip.providerId !== req.user.userId) {
      return res.status(403).json({ error: 'This trip does not belong to you' });
    }

    const bookings = await prisma.booking.findMany({
      where: { tripId: req.params.id, status: 'CONFIRMED' },
      select: {
        id: true, seatsBooked: true, totalPrice: true, status: true,
        pickupLocation: true, dropoffLocation: true, passengerName: true, passengerPhone: true,
        createdAt: true,
        customer: { select: { name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ bookings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading passengers' });
  }
});

// GET /trips/:id - PUBLIC. Same masking as /search: no driver name, no vehicle
// make/model/photo/registration until a booking is confirmed.
router.get('/:id', async (req, res) => {
  const trip = await prisma.trip.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      originCity: true,
      destinationCity: true,
      departureTime: true,
      pricePerSeat: true,
      totalSeats: true,
      seatsBooked: true,
      status: true,
      createdAt: true,
      vehicle: { select: { amenities: true } },
    },
  });
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json({ trip });
});

module.exports = router;
