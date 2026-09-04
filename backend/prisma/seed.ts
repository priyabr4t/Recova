// Seed: 100 customers/invoices/failed payments with deliberately planted
// patterns + edge-case fixtures the demo clicks on. Deterministic (seeded RNG,
// fixed base date) so every demo run is reproducible.
//
// Run: npm run db:seed
import { PrismaClient, RecoveryCause } from '@prisma/client'
import { mulberry32, hashString } from '../src/lib/rng.js'

export const prisma = new PrismaClient()

const BASE_SIM_NOW = new Date('2026-09-01T06:30:00.000Z') // 12:00 IST — contactable hours

const NAMES = [
  'Rahul Sharma', 'Priya Patel', 'Amit Kumar', 'Sneha Reddy', 'Vikram Singh',
  'Ananya Iyer', 'Rohit Mehta', 'Kavita Nair', 'Suresh Babu', 'Meera Krishnan',
  'Arjun Desai', 'Pooja Gupta', 'Karthik Raman', 'Divya Menon', 'Nikhil Joshi',
  'Ritu Agarwal', 'Sanjay Rao', 'Lakshmi Subramanian', 'Aditya Verma', 'Neha Kulkarni',
  'Manish Tiwari', 'Shreya Bose', 'Rajesh Khanna', 'Anita Deshmukh', 'Varun Chandra',
  'Deepika Sharma', 'Farhan Khan', 'Swathi Pillai', 'Gaurav Malhotra', 'Ishita Roy',
  'Yash Dubey', 'Preeti Sinha', 'Ramesh Pillai', 'Sunita Yadav', 'Aakash Jain',
  'Bhavna Shah', 'Imran Sheikh', 'Nandini Bhat', 'Prakash Gowda', 'Trisha Kapoor',
  'Mohit Bansal', 'Ayesha Siddiqui', 'Vivek Anand', 'Shalini Grover', 'Dinesh Karthik',
  'Rekha Rani', 'Siddharth Nayak', 'Meenakshi Sundaram', 'Abhishek Dutta', 'Charu Bhatia',
]

const CAUSE_WEIGHTS: Array<[RecoveryCause, number, string]> = [
  ['INSUFFICIENT_FUNDS', 0.42, 'insufficient_fund'],
  ['EXPIRED_CARD', 0.15, 'card_expired'],
  ['BANK_DECLINE', 0.15, 'bank_declined'],
  ['AUTHENTICATION_FAILED', 0.1, 'authentication_failed'],
  ['NETWORK_ERROR', 0.08, 'gateway_network_error'],
  ['CUSTOMER_CHURN', 0.07, 'customer_stopped_payment'],
  ['SUSPECTED_FRAUD', 0.03, 'fraud_suspected'],
]

const ERROR_DESCRIPTIONS: Record<string, string> = {
  insufficient_fund: 'Insufficient funds in customer account',
  card_expired: 'Card has expired',
  bank_declined: 'Payment declined by issuing bank',
  authentication_failed: 'Authentication failed during 2FA',
  gateway_network_error: 'Network error at payment gateway',
  customer_stopped_payment: 'Customer stopped the payment',
  fraud_suspected: 'Transaction flagged as potentially fraudulent',
}

function pickCause(rng: () => number): { cause: RecoveryCause; errorCode: string } {
  const roll = rng()
  let acc = 0
  for (const [cause, weight, errorCode] of CAUSE_WEIGHTS) {
    acc += weight
    if (roll <= acc) return { cause, errorCode }
  }
  return { cause: 'UNKNOWN', errorCode: 'unknown_error' }
}

export async function seed(): Promise<void> {
  const rng = mulberry32(42)
  await resetData()

  await prisma.systemState.create({ data: { id: 1, simNow: BASE_SIM_NOW } })

  for (let i = 0; i < 100; i++) {
    // Planted fixtures the demo will click on:
    let { cause, errorCode } = pickCause(rng)
    let optedOut = false
    let harassmentCount = 0

    if (i === 0) {
      cause = 'INSUFFICIENT_FUNDS'; errorCode = 'insufficient_fund'
      optedOut = true // demo: opted-out customer → straight to human escalation
    }
    if (i === 1) {
      cause = 'BANK_DECLINE'; errorCode = 'bank_declined'
      harassmentCount = 2 // demo: harassment guard blocks further outreach
    }
    if (i === 2) {
      cause = 'SUSPECTED_FRAUD'; errorCode = 'fraud_suspected' // demo: fraud → human, no automation
    }
    if (i === 3) {
      cause = 'INSUFFICIENT_FUNDS'; errorCode = 'insufficient_fund'
      // demo: high-value B2B invoice with a history of self-recovery → retry is right call
    }
    if (i === 4) {
      cause = 'EXPIRED_CARD'; errorCode = 'card_expired' // demo: email-first path
    }

    const isBig = i % 7 === 0
    const amountPaise = isBig
      ? BigInt(500_000 + Math.floor(rng() * 1_500_000)) * 100n // ₹5k–₹20L
      : BigInt(500 + Math.floor(rng() * 19_500)) * 100n // ₹500–₹20k

    const customer = await prisma.customer.create({
      data: {
        name: NAMES[i % NAMES.length]! + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''),
        email: `customer${i}@example.com`,
        phone: `+9198${String(10000000 + i).slice(-8)}`,
        optedOut,
        harassmentCount,
      },
    })

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${1000 + i}`,
        customerId: customer.id,
        amountPaise,
        dueDate: new Date(BASE_SIM_NOW.getTime() - 1000 * 60 * 60 * 24 * (3 + Math.floor(rng() * 20))),
        status: 'OUTSTANDING',
      },
    })

    await prisma.payment.create({
      data: {
        razorpayPaymentId: `pay_seed_${i}`,
        invoiceId: invoice.id,
        attemptNo: 1,
        amountPaise,
        status: 'FAILED',
        errorCode,
        errorDescription: ERROR_DESCRIPTIONS[errorCode] ?? 'Unknown failure',
        failedAt: BASE_SIM_NOW,
      },
    })

    // Fixture i=3: history of previous successful payments → supports "retry" decision
    if (i === 3) {
      for (let h = 0; h < 3; h++) {
        await prisma.payment.create({
          data: {
            razorpayPaymentId: `pay_hist_${i}_${h}`,
            invoiceId: invoice.id,
            attemptNo: 1,
            amountPaise,
            status: 'SUCCESS',
          },
        })
      }
    }

    // The failed payments sit as UNPROCESSED webhook events. POST /recovery/start
    // ingests them — that is the demo's "START RECOVERY" button.
    await prisma.webhookEvent.create({
      data: {
        eventId: `evt_seed_${i}`,
        eventType: 'payment.failed',
        payload: {
          event: 'payment.failed',
          payload: {
            payment: {
              entity: {
                id: `pay_seed_${i}`,
                invoice_number: invoice.invoiceNumber,
                amount: Number(amountPaise),
                error_code: errorCode,
                error_description: ERROR_DESCRIPTIONS[errorCode] ?? 'Unknown failure',
                failed_at: BASE_SIM_NOW.toISOString(),
              },
            },
          },
        },
      },
    })
  }

  const counts = {
    customers: await prisma.customer.count(),
    invoices: await prisma.invoice.count(),
    webhookEvents: await prisma.webhookEvent.count(),
  }
  console.log('seeded:', counts)
}

export async function resetData(): Promise<void> {
  // FK-safe order
  await prisma.auditLog.deleteMany()
  await prisma.recoveryAction.deleteMany()
  await prisma.recoveryLedger.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.recoveryCase.deleteMany()
  await prisma.webhookEvent.deleteMany()
  await prisma.invoice.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.systemState.deleteMany()
}

// invoked via `npm run db:seed`
if (process.argv[1]?.endsWith('seed.ts')) {
  seed()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error(err)
      prisma.$disconnect()
      process.exit(1)
    })
}
