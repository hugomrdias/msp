import { type Address, type Hex, isAddress, isHex } from 'viem'
import * as z from 'zod'

export const zHex = z.custom<Hex>((val) => {
  return typeof val === 'string' ? isHex(val) : false
}, 'Invalid hex value')

export const zAddress = z.custom<Address>((val) => {
  return typeof val === 'string' ? isAddress(val) : false
}, 'Invalid address')
