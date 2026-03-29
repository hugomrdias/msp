import { useFoxerQuery } from '@hugomrdias/foxer-react'
import { useCallback, useRef, useState } from 'react'
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
import { useDataSets } from '@/hooks/use-datasets'
import { useUploadSimple } from '@/hooks/use-upload'
import { formatBytes } from '@/lib/utils'
import { Badge } from './ui/badge'
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

type PieceRow = {
  id: bigint
  datasetId: bigint
  payer: string
  cid: string
  size?: bigint | number | string | null
  blockNumber?: bigint | number | string | null
  metadata?: Record<string, unknown> | null
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatSize(size: PieceRow['size']) {
  if (size === null || size === undefined) {
    return '-'
  }

  const numericSize = Number(size)
  if (Number.isNaN(numericSize)) {
    return String(size)
  }

  return formatBytes(numericSize)
}

function AddPieceDialog() {
  const { address } = useConnection()
  const [open, setOpen] = useState(false)
  const [datasetId, setDatasetId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: datasets, isPending: datasetsLoading } = useDataSets({
    address,
  })

  const { mutate, isPending, reset } = useUploadSimple({
    onHash: (hash) => {
      toast.info('Transaction submitted', {
        description: hash,
      })
    },
    mutation: {
      onSuccess: (data) => {
        toast.success('Piece added successfully', {
          description: `Added ${data.pieceCount} piece(s)`,
        })
        handleClose()
      },
      onError: (error) => {
        toast.error('Failed to add piece', {
          description: error.message,
        })
      },
    },
  })

  function handleClose() {
    setOpen(false)
    setDatasetId('')
    setFiles([])
    setDragging(false)
    reset()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (files.length === 0 || !datasetId) return
    mutate({ files, dataSetId: BigInt(datasetId) })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)])
    }
  }, [])

  const totalSize = files.reduce((acc, f) => acc + f.size, 0)

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) setOpen(true)
        else handleClose()
      }}
      open={open}
    >
      <DialogTrigger render={<Button size="sm" />}>Add Piece</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Piece</DialogTitle>
          <DialogDescription>
            Upload files as a new piece to a dataset.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Dataset</Label>
            <Select
              disabled={isPending || datasetsLoading}
              onValueChange={(value) => setDatasetId(value ?? '')}
              required
              value={datasetId}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    datasetsLoading ? 'Loading datasets...' : 'Select a dataset'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {datasets?.map((ds) => (
                    <SelectItem
                      key={String(ds.dataSetId)}
                      value={String(ds.dataSetId)}
                    >
                      <span>Dataset {String(ds.dataSetId)}</span>
                      <span className="text-muted-foreground">
                        {ds.provider.pdp.serviceURL}
                        {ds.pieces.length > 0 &&
                          ` · ${ds.pieces.length} piece(s)`}
                      </span>
                    </SelectItem>
                  ))}
                  {!datasetsLoading && datasets?.length === 0 && (
                    <p className="px-2 py-2 text-xs text-muted-foreground">
                      No datasets found
                    </p>
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Files</Label>
            <button
              className={`flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-2 border border-dashed p-4 text-center transition-colors ${
                dragging
                  ? 'border-ring bg-accent/50'
                  : 'border-input hover:border-ring/50 hover:bg-accent/20'
              } ${isPending ? 'pointer-events-none opacity-50' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              type="button"
            >
              <p className="text-xs text-muted-foreground">
                {dragging
                  ? 'Drop files here'
                  : 'Click to browse or drag and drop files'}
              </p>
            </button>
            <input
              className="hidden"
              disabled={isPending}
              multiple
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />
          </div>

          {files.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {files.length} file(s) &middot; {formatBytes(totalSize)}
                </p>
              </div>
              <div className="flex max-h-[140px] flex-col gap-1 overflow-y-auto">
                {files.map((file, index) => (
                  <div
                    className="flex items-center justify-between gap-2 border border-border/60 bg-muted/30 px-2 py-1"
                    key={`${file.name}-${String(index)}`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <p className="truncate text-xs">{file.name}</p>
                      <Badge className="shrink-0" variant="outline">
                        {formatBytes(file.size)}
                      </Badge>
                    </div>
                    <button
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                      disabled={isPending}
                      onClick={() => removeFile(index)}
                      type="button"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              disabled={isPending || files.length === 0 || !datasetId}
              size="sm"
              type="submit"
            >
              {isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function Pieces() {
  const { address } = useConnection()
  const [page, setPage] = useState(0)
  const pageSize = 50
  const { data, isPending } = useFoxerQuery({
    live: true,
    queryFn: (db) =>
      db.query.pieces.findMany({
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

  const fetchedRows = (data ?? []) as PieceRow[]
  const hasNextPage = fetchedRows.length > pageSize
  const rows = fetchedRows.slice(0, pageSize)

  return (
    <div className="py-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p>Pieces</p>
        <AddPieceDialog />
      </div>

      <Table>
        <TableCaption>Pieces for your address. Page {page + 1}.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Piece ID</TableHead>
            <TableHead>Dataset ID</TableHead>
            <TableHead>CID</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Metadata</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableRow>
              <TableCell colSpan={5}>Loading pieces...</TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>No pieces found.</TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow
                key={`${String(row.datasetId)}-${String(row.id)}-${String(index)}`}
              >
                <TableCell className="font-medium">{String(row.id)}</TableCell>
                <TableCell>{String(row.datasetId)}</TableCell>
                <TableCell className="max-w-[320px] truncate">
                  {row.cid}
                </TableCell>
                <TableCell>{formatSize(row.size)}</TableCell>
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

export default Pieces
