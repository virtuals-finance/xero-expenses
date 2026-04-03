# Xero Expense Approval Workflow

A Node.js service implementing a full expense submit → approve/reject → pay workflow
using Xero's **ACCPAY Invoices API** (replacement for the deprecated ExpenseClaims API).

## Architecture

```
Employee submits expense
        │
  POST /expenses
        │
  Xero Invoice (SUBMITTED)
        │
  Webhook fires → onExpenseSubmitted()
        │
  Manager approves/rejects
        │
  POST /expenses/:id/approve   POST /expenses/:id/reject
        │                               │
  Invoice (AUTHORISED)           Invoice (DRAFT + reference: "REJECTED: ...")
        │                               │
  Webhook fires                  Webhook fires → onExpenseRejected()
        │
  POST /expenses/:id/pay
        │
  Xero Payment recorded
        │
  Webhook fires → onExpensePaid()
```

## Setup

### 1. Create a Xero App

1. Go to https://developer.xero.com/myapps
2. Create a new **Web App**
3. Add redirect URI: `http://localhost:3000/auth/callback`
4. Copy your **Client ID** and **Client Secret**

### 2. Configure Environment

```bash
cp .env.example .env
# Fill in your credentials
```

### 3. Install & Run

```bash
npm install
npm run dev
```

### 4. Connect to Xero

Visit `http://localhost:3000/auth/connect` in your browser.
You'll be redirected to Xero login, then back to your app.

### 5. Configure Webhooks

In your Xero app settings:
- Add webhook URL: `https://your-domain.com/webhooks/xero`
- Subscribe to **Invoices** events
- Copy the **Webhook Key** to your `.env`

For local development use [ngrok](https://ngrok.com):
```bash
ngrok http 3000
# Use the generated https URL as your webhook endpoint
```

---

## API Reference

### Submit an Expense
```http
POST /expenses
Content-Type: application/json

{
  "employeeName": "Jane Smith",
  "employeeEmail": "jane@company.com",
  "description": "Team lunch - client meeting",
  "amount": 85.00,
  "accountCode": "420",
  "reference": "EXP-001"
}
```

### Approve an Expense
```http
POST /expenses/:invoiceId/approve
```

### Reject an Expense
```http
POST /expenses/:invoiceId/reject
Content-Type: application/json

{
  "reason": "Missing receipt"
}
```

### Pay an Expense
```http
POST /expenses/:invoiceId/pay
Content-Type: application/json

{
  "bankAccountCode": "090",
  "paymentDate": "2026-03-18"
}
```

### Attach a Receipt
```http
POST /expenses/:invoiceId/attachments
Content-Type: multipart/form-data

receipt: <file>
```

---

## Invoice Status Flow

| Status       | Meaning                            |
|--------------|------------------------------------|
| `DRAFT`      | Saved but not submitted            |
| `SUBMITTED`  | Submitted, pending approval        |
| `AUTHORISED` | Approved, ready for payment        |
| `PAID`       | Reimbursement paid out             |

> **Note:** Xero has no native "REJECTED" status. Rejection sets status back to
> `DRAFT` and stamps the `reference` field with `"REJECTED: <reason>"`. Handle
> this in your app layer (e.g. store rejection state in your own DB).

---

## Extending Webhook Handlers

Open `src/routes/webhooks.js` and fill in the handler functions:

```js
async function onExpenseSubmitted(invoice) {
  // Notify manager via Slack / email
}

async function onExpenseApproved(invoice) {
  // Notify finance + employee
}

async function onExpenseRejected(invoice) {
  // Notify employee with reason
}

async function onExpensePaid(invoice) {
  // Notify employee payment is on the way
}
```
