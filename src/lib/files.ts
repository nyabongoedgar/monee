/**
 * Hands a file to the user. Prefers the native share sheet (Save to Files, Drive, WhatsApp…),
 * falling back to a plain download where file sharing isn't available.
 */
export async function shareOrDownload(
  file: File,
  title: string,
): Promise<"shared" | "downloaded" | "cancelled"> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return "shared"
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError")
        return "cancelled"
      // Anything else: fall through to a download.
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return "downloaded"
}

export function datedFileName(base: string, extension: string): string {
  const day = new Date().toISOString().slice(0, 10)
  return `${base}-${day}.${extension}`
}
