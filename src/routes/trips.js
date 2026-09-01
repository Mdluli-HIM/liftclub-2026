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
    if (!provider.isVerified) {
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
      include: { provider: { select: { id: true, name: true } }, vehicle: true },
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

router.get('/:id', async (req, res) => {
  const trip = await prisma.trip.findUnique({
    where: { id: req.params.id },
    include: { provider: { select: { id: true, name: true } }, vehicle: true },
  });
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json({ trip });
});

module.exports = router;
