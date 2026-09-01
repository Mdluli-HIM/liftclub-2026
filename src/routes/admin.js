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
        id: true, name: true, email: true, phone: true, isVerified: true, createdAt: true,
        idDocumentUrl: true, licenseDocumentUrl: true,
      },
      orderBy: [{ isVerified: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({ providers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading providers' });
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
      data: { isVerified: true },
      select: { id: true, name: true, email: true, isVerified: true },
    });

    res.json({ provider: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong approving the provider' });
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
