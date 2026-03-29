import { useFoxerQuery } from '@hugomrdias/foxer-react'
import { useState } from 'react'
import { useConnection } from 'wagmi'

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatBytes } from '@/lib/utils'

import { Badge } from './ui/badge'
import { Button } from './ui/button'

type CopyRow = {
  id: bigint
  payer: string
  sourceDatasetId: bigint
  sourcePieceId: bigint
  sourceProviderId: bigint
  sourceBlockNumber: bigint
  targetProviderId?: bigint | null
  targetDatasetId?: bigint | null
  targetPieceId?: bigint | null
  targetBlockNumber?: bigint | null
  cid: string
  size?: bigint | null
  status: string
  error?: string | null
  createdAt: bigint
  updatedAt?: bigint | null
  finalizedAt?: bigint | null
}

const statusVariant: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  processing: 'secondary',
  confirmed: 'default',
  finalized: 'default',
  failed: 'destructive',
  orphaned: 'destructive',
}

function formatSize(size: bigint | null | undefined) {
  if (size === null || size === undefined) return '-'
  const n = Number(size)
  return Number.isNaN(n) ? String(size) : formatBytes(n)
}

export function Copies() {
  const { address } = useConnection()
  const [page, setPage] = useState(0)
  const pageSize = 50
  const { data, isPending } = useFoxerQuery({
    live: true,
    queryFn: (db) =>
      db.query.pieceCopies.findMany({
        limit: pageSize + 1,
        offset: page * pageSize,
        orderBy: {
          createdAt: 'desc',
        },
        where: {
          payer: address,
        },
      }),
  })

  const fetchedRows = (data ?? []) as CopyRow[]
  const hasNextPage = fetchedRows.length > pageSize
  const rows = fetchedRows.slice(0, pageSize)

  return (
    <div className="py-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p>Copies</p>
      </div>

      <Table>
        <TableCaption>
          Piece copies for your address. Page {page + 1}.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>CID</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableRow>
              <TableCell colSpan={5}>Loading copies...</TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>No copies found.</TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={`${String(row.id)}-${String(index)}`}>
                <TableCell className="max-w-[280px] truncate font-mono text-xs">
                  {row.cid}
                </TableCell>
                <TableCell>{formatSize(row.size)}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5 text-xs">
                    <span>
                      Dataset {String(row.sourceDatasetId)} / Piece{' '}
                      {String(row.sourcePieceId)}
                    </span>
                    <span className="text-muted-foreground">
                      Provider {String(row.sourceProviderId)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {row.targetProviderId == null ? (
                    '-'
                  ) : (
                    <div className="flex flex-col gap-0.5 text-xs">
                      {row.targetDatasetId != null &&
                        row.targetPieceId != null && (
                          <span>
                            Dataset {String(row.targetDatasetId)} / Piece{' '}
                            {String(row.targetPieceId)}
                          </span>
                        )}
                      <span className="text-muted-foreground">
                        Provider {String(row.targetProviderId)}
                      </span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant={statusVariant[row.status] ?? 'outline'}>
                      {row.status}
                    </Badge>
                    {row.error && (
                      <p className="max-w-[200px] truncate text-[10px] text-destructive">
                        {row.error}
                      </p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="flex items-center gap-2">
        <Button
          disabled={page === 0 || isPending}
          onClick={() => setPage((prev) => Math.max(0, prev - 1))}
          size="sm"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          disabled={!hasNextPage || isPending}
          onClick={() => setPage((prev) => prev + 1)}
          size="sm"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </div>
  )
}

export default Copies
