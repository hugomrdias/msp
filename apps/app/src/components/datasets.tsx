import { useFoxerQuery } from '@hugomrdias/foxer-react'
import { useState } from 'react'
import { toast } from 'sonner'
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
import { useCreateDataSet } from '@/hooks/use-create-dataset'
import { useProviders } from '@/hooks/use-providers'

import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Label } from './ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

type DatasetRow = {
  dataSetId: bigint
  providerId: bigint
  payer: string
  serviceProvider: string
  payee: string
  blockNumber?: bigint | number | string | null
  metadata?: Record<string, unknown> | null
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) {
    return '-'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

function AddDatasetDialog() {
  const [open, setOpen] = useState(false)
  const [providerId, setProviderId] = useState('')
  const [cdn, setCdn] = useState(false)

  const { data: providers = [], isPending: providersLoading } = useProviders()

  const { mutate, isPending, reset } = useCreateDataSet({
    onHash: (hash) => {
      toast.info('Transaction submitted', { description: hash })
    },
    mutation: {
      onSuccess: (data) => {
        toast.success('Dataset created', {
          description: `Dataset ID: ${String(data.dataSetId)}`,
        })
        handleClose()
      },
      onError: (error) => {
        toast.error('Failed to create dataset', {
          description: error.message,
        })
      },
    },
  })

  function handleClose() {
    setOpen(false)
    setProviderId('')
    setCdn(false)
    reset()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const selected = providers.find((p) => String(p.id) === providerId)
    if (!selected) return
    mutate({ provider: selected, cdn })
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) setOpen(true)
        else handleClose()
      }}
      open={open}
    >
      <DialogTrigger render={<Button size="sm" />}>Add Dataset</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Dataset</DialogTitle>
          <DialogDescription>
            Create a new dataset with a storage provider.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Provider</Label>
            <Select
              disabled={isPending || providersLoading}
              onValueChange={(value) => setProviderId(value ?? '')}
              required
              value={providerId}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    providersLoading
                      ? 'Loading providers...'
                      : 'Select a provider'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {providers.map((p) => (
                    <SelectItem key={String(p.id)} value={String(p.id)}>
                      <span>Provider {String(p.id)}</span>
                      {p.pdp.serviceURL && (
                        <span className="text-muted-foreground">
                          {p.pdp.serviceURL}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                  {!providersLoading && providers.length === 0 && (
                    <p className="px-2 py-2 text-xs text-muted-foreground">
                      No providers found
                    </p>
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              checked={cdn}
              disabled={isPending}
              onChange={(e) => setCdn(e.target.checked)}
              type="checkbox"
            />
            Enable CDN
          </label>

          <DialogFooter>
            <Button disabled={isPending || !providerId} size="sm" type="submit">
              {isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function Datasets() {
  const { address } = useConnection()
  const [page, setPage] = useState(0)
  const pageSize = 50
  const { data, isPending } = useFoxerQuery({
    live: true,
    queryFn: (db) =>
      db.query.datasets.findMany({
        limit: pageSize + 1,
        offset: page * pageSize,
        orderBy: {
          blockNumber: 'desc',
        },
        where: {
          payer: address,
        },
      }),
  })

  const fetchedRows = (data ?? []) as DatasetRow[]
  const hasNextPage = fetchedRows.length > pageSize
  const rows = fetchedRows.slice(0, pageSize)

  return (
    <div className="py-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p>Datasets</p>
        <AddDatasetDialog />
      </div>

      <Table>
        <TableCaption>Datasets for your address. Page {page + 1}.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Dataset ID</TableHead>
            <TableHead>Provider ID</TableHead>
            <TableHead>Service Provider</TableHead>
            <TableHead>Metadata</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableRow>
              <TableCell colSpan={4}>Loading datasets...</TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>No datasets found.</TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={`${String(row.dataSetId)}-${String(index)}`}>
                <TableCell className="font-medium">
                  {String(row.dataSetId)}
                </TableCell>
                <TableCell>{String(row.providerId)}</TableCell>
                <TableCell className="max-w-[220px] truncate">
                  {row.serviceProvider}
                </TableCell>
                <TableCell className="max-w-[320px]">
                  {row.metadata ? (
                    <div className="flex flex-col items-start gap-1.5">
                      {Object.entries(row.metadata).length > 0
                        ? Object.entries(row.metadata).map(([key, value]) => (
                            <div
                              className="inline-flex w-fit max-w-full flex-col rounded-none border border-border/60 bg-muted/30 px-2 py-1"
                              key={key}
                            >
                              <p className="text-[10px] text-muted-foreground">
                                {key}
                              </p>
                              <p className="max-w-full font-mono text-[11px] break-all whitespace-normal">
                                {formatMetadataValue(value)}
                              </p>
                            </div>
                          ))
                        : '-'}
                    </div>
                  ) : (
                    '-'
                  )}
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

export default Datasets
