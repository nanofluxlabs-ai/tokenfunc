import { ImageUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { getServerErrorMessage } from '@/lib/server-error-message'

import { uploadSiteAsset } from '../api'

const MAX_BYTES = 2 * 1024 * 1024
const ACCEPT = 'image/png,image/jpeg,image/webp'

type SiteAssetUploadButtonProps = {
  kind: 'sales-qrcode'
  /** 上传成功后回填站内地址；保存仍走表单的「保存」 */
  onUploaded: (url: string) => void
}

/** tokenfunc 二开：选择图片上传到对象存储（后端再校验类型与大小，这里只做前置拦截） */
export function SiteAssetUploadButton(props: SiteAssetUploadButtonProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (file: File) => {
    if (!ACCEPT.split(',').includes(file.type) || file.size > MAX_BYTES) {
      toast.error(t('Only PNG, JPEG or WebP images up to 2 MB are supported'))
      return
    }
    setUploading(true)
    try {
      const response = await uploadSiteAsset(props.kind, file)
      if (!response.success || !response.data?.url) {
        toast.error(
          getServerErrorMessage(
            response,
            t('Upload failed, please try again later')
          )
        )
        return
      }
      props.onUploaded(response.data.url)
      toast.success(t('Image uploaded. Click Save to apply it.'))
    } catch (error) {
      toast.error(
        getServerErrorMessage(error, t('Upload failed, please try again later'))
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type='file'
        accept={ACCEPT}
        className='hidden'
        aria-hidden='true'
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          // 清空以便再次选择同一文件也能触发
          event.target.value = ''
          if (file) void upload(file)
        }}
      />
      <Button
        type='button'
        variant='outline'
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className='shrink-0'
      >
        {uploading ? (
          <Spinner className='size-4' />
        ) : (
          <ImageUp className='size-4' aria-hidden='true' />
        )}
        {uploading ? t('Uploading…') : t('Upload image')}
      </Button>
    </>
  )
}
