const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/downloadController');

router.post('/info', ctrl.getMetadata);
router.post('/download', ctrl.downloadMedia);
router.post('/audio', ctrl.convertMedia);

module.exports = router;
