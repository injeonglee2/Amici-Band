/**
 * 이미지 File 을 업로드 전에 줄여서 JPEG 로 압축한다.
 * - 긴 변을 maxDim(기본 1600px) 이내로 리사이즈, 품질 quality(기본 0.7)
 * - EXIF 회전 자동 보정(createImageBitmap 의 imageOrientation)
 * - 어떤 이유로든 실패하거나 결과가 더 크면 원본 File 을 그대로 반환(안전)
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.7): Promise<Blob> {
  try {
    if (!file.type.startsWith('image/')) return file
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bmp.close()
      return file
    }
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    // 압축이 원본보다 작을 때만 사용(이미 작은/압축된 파일은 원본 유지)
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}
