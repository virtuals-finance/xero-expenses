import { getAuthenticatedClient } from "../xeroClient.js";
import { Invoices, Invoice, Payments, Payment, Contacts, Contact, LineItem } from "xero-node";
import fs from "fs";
import path from "path";

/**
 * Ensure an employee exists as a Xero Contact. Creates one if not found.
 * Returns the ContactID.
 */
export async function upsertEmployeeContact({ name, email }) {
  const { client, tenantId } = await getAuthenticatedClient();

  // Search for existing contact by name
  const existing = await client.accountingApi.getContacts(
    tenantId,
    undefined, undefined, undefined,
    undefined, undefined, undefined,
    undefined, undefined, undefined,
    undefined, undefined,
    `Name="${name}"`
  );

  if (existing.body.contacts && existing.body.contacts.length > 0) {
    return existing.body.contacts[0].contactID;
  }

  // Create new contact
  const contact = new Contact();
  contact.name = name;
  contact.emailAddress = email;

  const contacts = new Contacts();
  contacts.contacts = [contact];

  const created = await client.accountingApi.createContacts(tenantId, contacts);
  return created.body.contacts[0].contactID;
}

/**
 * Submit a new expense as an ACCPAY Invoice with status SUBMITTED.
 *
 * @param {object} expense
 * @param {string} expense.employeeName
 * @param {string} expense.employeeEmail
 * @param {string} expense.description
 * @param {number} expense.amount
 * @param {string} expense.accountCode   - Xero account code e.g. "420"
 * @param {string} [expense.reference]   - Optional reference e.g. "EXP-001"
 * @param {string} [expense.date]        - ISO date string, defaults to today
 * @param {string} [expense.dueDate]     - ISO date string, defaults to 7 days from now
 */
export async function submitExpense(expense) {
  const { client, tenantId } = await getAuthenticatedClient();

  const contactId = await upsertEmployeeContact({
    name: expense.employeeName,
    email: expense.employeeEmail,
  });

  const today = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 7);

  const lineItem = new LineItem();
  lineItem.description = expense.description;
  lineItem.quantity = 1.0;
  lineItem.unitAmount = expense.amount;
  lineItem.accountCode = expense.accountCode;

  const invoice = new Invoice();
  invoice.type = Invoice.TypeEnum.ACCPAY;
  invoice.contact = { contactID: contactId };
  invoice.date = expense.date || today.toISOString().split("T")[0];
  invoice.dueDate = expense.dueDate || due.toISOString().split("T")[0];
  invoice.status = Invoice.StatusEnum.SUBMITTED;
  invoice.lineItems = [lineItem];
  invoice.reference = expense.reference || "";

  const invoices = new Invoices();
  invoices.invoices = [invoice];

  const result = await client.accountingApi.createInvoices(tenantId, invoices);
  const created = result.body.invoices[0];

  return {
    invoiceId: created.invoiceID,
    invoiceNumber: created.invoiceNumber,
    status: created.status,
    amount: created.total,
    employee: expense.employeeName,
  };
}

/**
 * Approve an expense - moves the invoice from SUBMITTED → AUTHORISED.
 */
export async function approveExpense(invoiceId) {
  const { client, tenantId } = await getAuthenticatedClient();

  const invoice = new Invoice();
  invoice.invoiceID = invoiceId;
  invoice.status = Invoice.StatusEnum.AUTHORISED;

  const invoices = new Invoices();
  invoices.invoices = [invoice];

  const result = await client.accountingApi.updateInvoice(tenantId, invoiceId, invoices);
  const updated = result.body.invoices[0];

  return {
    invoiceId: updated.invoiceID,
    status: updated.status,
    amount: updated.total,
  };
}

/**
 * Reject an expense - moves it back to DRAFT and appends a rejection note.
 * Rejection reason is stored in the invoice reference field (Xero has no native reject status).
 */
export async function rejectExpense(invoiceId, reason = "Rejected by approver") {
  const { client, tenantId } = await getAuthenticatedClient();

  const invoice = new Invoice();
  invoice.invoiceID = invoiceId;
  invoice.status = Invoice.StatusEnum.DRAFT;
  invoice.reference = `REJECTED: ${reason}`;

  const invoices = new Invoices();
  invoices.invoices = [invoice];

  const result = await client.accountingApi.updateInvoice(tenantId, invoiceId, invoices);
  const updated = result.body.invoices[0];

  return {
    invoiceId: updated.invoiceID,
    status: updated.status,
    reference: updated.reference,
  };
}

/**
 * Pay out an approved expense (reimburse the employee).
 *
 * @param {string} invoiceId
 * @param {string} bankAccountCode - Xero bank account code e.g. "090"
 * @param {string} [paymentDate]   - ISO date string, defaults to today
 */
export async function payExpense(invoiceId, bankAccountCode, paymentDate) {
  const { client, tenantId } = await getAuthenticatedClient();

  // Fetch the invoice to get the outstanding amount
  const invoiceResult = await client.accountingApi.getInvoice(tenantId, invoiceId);
  const invoice = invoiceResult.body.invoices[0];

  if (invoice.status !== "AUTHORISED") {
    throw new Error(`Invoice ${invoiceId} must be AUTHORISED before payment. Current status: ${invoice.status}`);
  }

  const payment = new Payment();
  payment.invoice = { invoiceID: invoiceId };
  payment.account = { code: bankAccountCode };
  payment.date = paymentDate || new Date().toISOString().split("T")[0];
  payment.amount = invoice.amountDue;

  const payments = new Payments();
  payments.payments = [payment];

  const result = await client.accountingApi.createPayment(tenantId, payment);
  const created = result.body.payments[0];

  return {
    paymentId: created.paymentID,
    invoiceId,
    amount: created.amount,
    date: created.date,
    status: created.status,
  };
}

/**
 * Attach a receipt file to an invoice.
 *
 * @param {string} invoiceId
 * @param {string} filePath  - absolute path to the file on disk
 * @param {string} mimeType  - e.g. "image/jpeg", "application/pdf"
 */
export async function attachReceipt(invoiceId, filePath, mimeType) {
  const { client, tenantId } = await getAuthenticatedClient();

  const fileName = path.basename(filePath);
  const fileContent = fs.readFileSync(filePath);

  const result = await client.accountingApi.createInvoiceAttachmentByFileName(
    tenantId,
    invoiceId,
    fileName,
    true, // includeOnline
    fileContent,
    { headers: { "Content-Type": mimeType } }
  );

  const attachment = result.body.attachments[0];

  return {
    attachmentId: attachment.attachmentID,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    url: attachment.url,
  };
}

/**
 * Get a single expense invoice by ID.
 */
export async function getExpense(invoiceId) {
  const { client, tenantId } = await getAuthenticatedClient();
  const result = await client.accountingApi.getInvoice(tenantId, invoiceId);
  return result.body.invoices[0];
}
