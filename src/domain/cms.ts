import type { MediaKind } from './portfolio'

export interface OwnerMembership {
  readonly authUserId: string
  readonly role: 'owner'
  readonly status: 'active' | 'disabled'
}

export interface MediaAsset {
  readonly id: string
  readonly ownerId: string
  readonly sourceType: 'upload' | 'external'
  readonly kind: MediaKind
  readonly technicalState: 'pending' | 'uploading' | 'processing' | 'ready' | 'failed'
  readonly rightsState: 'pending' | 'cleared' | 'rejected'
}

export interface UploadRequest {
  readonly name: string
  readonly kind: MediaAsset['kind']
  readonly declaredMime: string
  readonly bytes: number
  readonly checksum?: string
}

export type InquiryReply =
  | { readonly email: string; readonly whatsapp?: string }
  | { readonly email?: string; readonly whatsapp: string }

export type MarketingConsent =
  | { readonly marketing: false }
  | { readonly marketing: true; readonly policyVersion: string }

export type InquiryInput = {
  readonly name: string
  readonly projectTypeId: string
  readonly serviceId: string
  readonly brief: string
  readonly budget?: string
  readonly deadline?: string
} & InquiryReply & MarketingConsent

export interface InquiryReceipt {
  readonly inquiryId: string
  readonly whatsAppUrl: string
}

