const express = require('express');
const prisma = require('../lib/prisma');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/providers', async (req, res) => {
  try {
    const providers = await prisma.user.findMany({
      where: { role: 'PROVIDER' },
      select: {
        id: true, name: true, email: true, phone: true,
        verificationStatus: true, rejectionReason: true, createdAt: true,
        idDocumentUrl: true, licenseDocumentUrl: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ providers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading providers' });
  }
});

// GET /admin/providers/:id - full detail: profile + documents + every vehicle + every trip
router.get('/providers/:id', async (req, res) => {
  try {
    const provider = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        verificationStatus: true, rejectionReason: true, createdAt: true,
        idDocumentUrl: true, licenseDocumentUrl: true,
      },
    });

    if (!provider || provider.role !== 'PROVIDER') {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const vehicles = await prisma.vehicle.findMany({
      where: { providerId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });

    const trips = await prisma.trip.findMany({
      where: { providerId: req.params.id },
      orderBy: { departureTime: 'desc' },
    });

    res.json({ provider, vehicles, trips });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading this provider' });
  }
});

router.post('/providers/:id/approve', async (req, res) => {
  try {
    const provider = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!provider || provider.role !== 'PROVIDER') {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { verificationStatus: 'APPROVED', rejectionReason: null },
      select: { id: true, name: true, email: true, verificationStatus: true },
    });

    res.json({ provider: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong approving the provider' });
  }
});

// POST /admin/providers/:id/reject - requires a reason, visible to the provider
router.post('/providers/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A rejection reason is required' });
    }

    const provider = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!provider || provider.role !== 'PROVIDER') {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { verificationStatus: 'REJECTED', rejectionReason: reason.trim() },
      select: { id: true, name: true, email: true, verificationStatus: true, rejectionReason: true },
    });

    res.json({ provider: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong rejecting the provider' });
  }
});

router.get('/bookings', async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      include: {
        customer: { select: { id: true, name: true, email: true } },
        trip: { include: { provider: { select: { id: true, name: true } }, vehicle: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ bookings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading bookings' });
  }
});

module.exports = router;
