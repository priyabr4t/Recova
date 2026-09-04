import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PORT: z.coerce.number().default(8080),
  LOG_LEVEL: z.string().default('info'),

  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
  DEV_ALLOW_UNSIGNED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_TIMEOUT_MS: z.coerce.number().default(8000),

  SIM_SEED: z.coerce.number().default(42),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('invalid env:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
/** When true the system must run with zero network deps (demo resilience). */
export const llmEnabled = env.OPENAI_API_KEY.length > 0
