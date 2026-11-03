import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { SiteAssetUploadButton } from '../site-asset-upload-button'

const apiMock = vi.hoisted(() => ({ uploadSiteAsset: vi.fn() }))
vi.mock('../../api', () => apiMock)
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type=file]')
  if (!input) throw new Error('file input missing')
  return input as HTMLInputElement
}

beforeEach(() => {
  apiMock.uploadSiteAsset.mockReset()
  toastMock.success.mockReset()
  toastMock.error.mockReset()
})
afterEach(cleanup)

describe('SiteAssetUploadButton', () => {
  test('uploads the chosen image and fills back the site asset url', async () => {
    apiMock.uploadSiteAsset.mockResolvedValue({
      success: true,
      data: { url: '/api/site-assets/sales-qrcode/0123456789abcdef.png' },
    })
    const onUploaded = vi.fn()
    const { container } = render(
      <SiteAssetUploadButton kind='sales-qrcode' onUploaded={onUploaded} />
    )
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'qr.png', {
      type: 'image/png',
    })
    await userEvent.upload(fileInput(container), file)
    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith(
        '/api/site-assets/sales-qrcode/0123456789abcdef.png'
      )
    )
    expect(apiMock.uploadSiteAsset).toHaveBeenCalledWith('sales-qrcode', file)
    expect(screen.getByRole('button', { name: /Upload image/ })).toBeTruthy()
  })

  test('rejects non-image or oversized files before uploading', async () => {
    const onUploaded = vi.fn()
    const { container } = render(
      <SiteAssetUploadButton kind='sales-qrcode' onUploaded={onUploaded} />
    )
    const svg = new File(['<svg/>'], 'qr.svg', { type: 'image/svg+xml' })
    await userEvent.upload(fileInput(container), svg, { applyAccept: false })
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', {
      type: 'image/png',
    })
    await userEvent.upload(fileInput(container), big)
    expect(apiMock.uploadSiteAsset).not.toHaveBeenCalled()
    expect(onUploaded).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledTimes(2)
  })

  test('shows the server error and keeps the field unchanged when storage is not configured', async () => {
    apiMock.uploadSiteAsset.mockResolvedValue({
      success: false,
      message: 'Object storage is not configured. Enter an image URL instead.',
    })
    const onUploaded = vi.fn()
    const { container } = render(
      <SiteAssetUploadButton kind='sales-qrcode' onUploaded={onUploaded} />
    )
    await userEvent.upload(
      fileInput(container),
      new File([new Uint8Array([1])], 'qr.png', { type: 'image/png' })
    )
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
    expect(onUploaded).not.toHaveBeenCalled()
  })
})
