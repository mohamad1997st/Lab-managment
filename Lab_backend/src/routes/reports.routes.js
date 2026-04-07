const express = require('express');
const router = express.Router();
const pdf = require('../controllers/reports.pdf.controller');
const performance = require('../controllers/performance.controller');
const { requireAuth, requireRole, requireActiveSubscription } = require('../middleware/auth.middleware');
const { ROLE_OWNER, ROLE_MANAGER } = require('../config/roles');
const reports = require('../controllers/reports.controller');

router.use(requireAuth);

router.get('/inventory/pdf', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), pdf.inventoryPDF);
router.get('/production/pdf', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), pdf.productionByEmployeePDF);
router.get('/contamination/pdf', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), pdf.contaminationByEmployeePDF);
router.get('/production-by-species/pdf', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), reports.productionBySpeciesPdf);
router.get('/production/summary-by-phase/pdf', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), reports.productionSummaryByPhasePdf);
router.get('/daily-matrix/pdf', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), reports.dailyMatrixPdf);
router.get('/operations/pdf', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), reports.operationsPdf);
router.get('/contamination/filtered/pdf', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), reports.contaminationFilteredPdf);
router.get('/inventory-ops-detail/grouped/pdf', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), reports.inventoryOpsDetailGroupedPdf);
router.get('/weekly-matrix/pdf', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), reports.weeklyMatrixPdf);
router.get('/inventory-adjustments/pdf', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), reports.inventoryAdjustmentsPdf);

router.get('/performance/employee', performance.employeePerformance);
router.get('/performance/species-upgrades', requireRole(ROLE_OWNER, ROLE_MANAGER), requireActiveSubscription(), performance.speciesUpgradePerformance);

module.exports = router;
