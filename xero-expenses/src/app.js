import express from "express";
import session from "express-session";
import { authRouter } from "./routes/auth.js";
import { expenseRouter } from "./routes/expenses.js";
import { webhookRouter } from "./routes/webhooks.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-me-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production" },
  })
);

app.use("/auth", authRouter);
app.use("/expenses", expenseRouter);
app.use("/webhooks", webhookRouter);

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Xero expense service running on port ${PORT}`));

export default app;
