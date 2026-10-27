/** How an attachment's size of `bytes` bytes reads: megabytes to one decimal from 1 MB, else whole kilobytes, at least 1 KB. */
export const attachmentSizeText = (bytes: number) => bytes >= 1048576
  ? `${(bytes / 1048576).toFixed(1)} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`
