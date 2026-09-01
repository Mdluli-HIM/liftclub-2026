const express = require('express');
const prisma = require('../lib/prisma');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const upload = require('../lib/upload');

const router = express.Router();

router.post(
  '/documents',
  requireAuth,
  requireRole('PROVIDER'),
  upload.fields([
    { name: 'idDocument', maxCount: 1 },
    { name: 'licenseDocument', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const data = {};

      if (req.files && req.files.idDocument) {
        data.idDocumentUrl = '/uploads/' + req.files.idDocument[0].filename;
      }
      if (req.files && req.files.licenseDocument) {
        data.licenseDocumentUrl = '/uploads/' + req.files.licenseDocument[0].filename;
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'At least one document (idDocument or licenseDocument) is required' });
      }

      const user = await prisma.user.update({
        where: { id: req.user.userId },
        data,
        select: { id: true, name: true, email: true, isVerified: true, idDocumentUrl: true, licenseDocumentUrl: true },
      });

      res.json({ user });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Something went wrong uploading documents' });
    }
  }
);

module.exports = router;
