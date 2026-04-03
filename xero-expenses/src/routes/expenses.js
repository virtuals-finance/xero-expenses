import { Router } from "express";
import multer from "multer";
import {
  submitExpense,
  approveExpense,
  rejectExpense,
  payExpense,
  attachReceipt,
  getExpense,
} from "../services/expenseService.js";

export const expenseRouter = Router();

const upload = multer({ dest: "/tmp/xero-receipts/" });

/**
 * POST /expenses
 * Submit a new expense claim
 *
 * Body: { employeeName, employeeEmail, description, amount, accountCode, reference? }
 */
expenseRouter.post("/", async (req, res) => {
  try {
    const { employeeName, employeeEmail, description, amount, accountCode, reference } = req.body;

    if (!employeeName || !employeeEmail || !description || !amount || !accountCode) {
      return res.status(400).json({
        error: "Missing required fields: employeeName, employeeEmail, description, amount, accountCode",
      });
    }

    const result = await submitExpense({ employeeName, employeeEmail, description, amount, accountCode, reference });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /expenses/:invoiceId
 * Get expense details
 */
expenseRouter.get("/:invoiceId", async (req, res) => {
  try {
    const expense = await getExpense(req.params.invoiceId);
    res.json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /expenses/:invoiceId/approve
 * Approve an expense
 */
expenseRouter.post("/:invoiceId/approve", async (req, res) => {
  try {
    const result = await approveExpense(req.params.invoiceId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /expenses/:invoiceId/reject
 * Reject an expense
 *
 * Body: { reason? }
 */
expenseRouter.post("/:invoiceId/reject", async (req, res) => {
  try {
    const result = await rejectExpense(req.params.invoiceId, req.body.reason);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /expenses/:invoiceId/pay
 * Pay out an approved expense
 *
 * Body: { bankAccountCode, paymentDate? }
 */
expenseRouter.post("/:invoiceId/pay", async (req, res) => {
  try {
    const { bankAccountCode, paymentDate } = req.body;

    if (!bankAccountCode) {
      return res.status(400).json({ error: "bankAccountCode is required" });
    }

    const result = await payExpense(req.params.invoiceId, bankAccountCode, paymentDate);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /expenses/:invoiceId/attachments
 * Attach a receipt file to an expense
 *
 * Multipart form: file field = "receipt"
 */
expenseRouter.post("/:invoiceId/attachments", upload.single("receipt"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded. Use multipart field name 'receipt'" });
    }

    const result = await attachReceipt(
      req.params.invoiceId,
      req.file.path,
      req.file.mimetype
    );

    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
