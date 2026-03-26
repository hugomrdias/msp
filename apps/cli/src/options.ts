import { z } from 'incur'

export const globalOptions = z.object({
  chainId: z
    .enum(['314159', '314'])
    .optional()
    .default('314159')
    .transform((value) => parseInt(value, 10))
    .describe('Chain to use'),
  debug: z.boolean().optional().default(false).describe('Debug mode'),
})
