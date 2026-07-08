/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Gift, Receipt, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getSelf } from '@/lib/api'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { SectionPageLayout } from '@/components/layout'
import { Card, CardContent } from '@/components/ui/card'
import { BillingHistoryDialog } from './components/dialogs/billing-history-dialog'
import { CreemConfirmDialog } from './components/dialogs/creem-confirm-dialog'
import { PaymentConfirmDialog } from './components/dialogs/payment-confirm-dialog'
import { RechargeFormCard } from './components/recharge-form-card'
import { SubscriptionPlansCard } from './components/subscription-plans-card'
import { WalletStatsCard } from './components/wallet-stats-card'
import { DEFAULT_DISCOUNT_RATE } from './constants'
import {
  useTopupInfo,
  usePayment,
  useRedemption,
  useCreemPayment,
  useWaffoPayment,
  useWaffoPancakePayment,
} from './hooks'
import {
  getDefaultPaymentType,
  getMinTopupAmount,
  isWaffoPancakePayment,
} from './lib'
import type {
  UserWalletData,
  PaymentMethod,
  PresetAmount,
  CreemProduct,
} from './types'

interface WalletProps {
  initialShowHistory?: boolean
}

export function Wallet(props: WalletProps) {
  const { t } = useTranslation()
  const [user, setUser] = useState<UserWalletData | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [topupAmount, setTopupAmount] = useState(0)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>()
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [billingDialogOpen, setBillingDialogOpen] = useState(false)
  const [redemptionCode, setRedemptionCode] = useState('')
  const [creemDialogOpen, setCreemDialogOpen] = useState(false)
  const [selectedCreemProduct, setSelectedCreemProduct] =
    useState<CreemProduct | null>(null)
  const [showSubscriptionPanel, setShowSubscriptionPanel] = useState(true)

  const { status } = useStatus()
  const { currency } = useSystemConfig()
  const { topupInfo, presetAmounts, loading: topupLoading } = useTopupInfo()

  // Calculate effective exchange rate - when display type is USD, use rate of 1
  const effectiveUsdExchangeRate = useMemo(() => {
    return currency?.quotaDisplayType === 'USD'
      ? 1
      : currency?.usdExchangeRate || 1
  }, [currency?.quotaDisplayType, currency?.usdExchangeRate])
  const {
    amount: paymentAmount,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
    setAmount: setPaymentAmount,
  } = usePayment()
  const { redeeming, redeemCode } = useRedemption()
  const { processing: creemProcessing, processCreemPayment } = useCreemPayment()
  const { processWaffoPayment } = useWaffoPayment()
  const { processing: pancakeProcessing, processWaffoPancakePayment } =
    useWaffoPancakePayment()

  // Fetch and refresh user data
  const fetchUser = useCallback(async () => {
    try {
      setUserLoading(true)
      const response = await getSelf()
      if (response.success && response.data) {
        setUser(response.data as UserWalletData)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch user data:', error)
    } finally {
      setUserLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  useEffect(() => {
    if (props.initialShowHistory) {
      setBillingDialogOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [props.initialShowHistory])

  // Get current payment type (selected or default)
  const getCurrentPaymentType = useCallback(() => {
    return selectedPaymentMethod?.type || getDefaultPaymentType(topupInfo)
  }, [selectedPaymentMethod, topupInfo])

  // Handle preset selection
  const handleSelectPreset = (preset: PresetAmount) => {
    setTopupAmount(preset.value)
    setSelectedPreset(preset.value)
    calculatePaymentAmount(preset.value, getCurrentPaymentType())
  }

  // Handle topup amount change
  const handleTopupAmountChange = (amount: number) => {
    setTopupAmount(amount)
    setSelectedPreset(null)
    if (amount <= 0) {
      setPaymentAmount(0)
      return
    }
    calculatePaymentAmount(amount, getCurrentPaymentType())
  }

  // Handle payment method selection
  const handlePaymentMethodSelect = async (method: PaymentMethod) => {
    setSelectedPaymentMethod(method)
    setPaymentLoading(method.type)

    try {
      // Validate minimum topup
      const minTopup = getMinTopupAmount(topupInfo)
      const validatedAmount =
        topupAmount > 0 && topupAmount < minTopup ? minTopup : topupAmount

      if (validatedAmount <= 0) return

      if (validatedAmount !== topupAmount) {
        setTopupAmount(validatedAmount)
        setSelectedPreset(null)
      }

      // Calculate payment amount and show confirmation dialog
      await calculatePaymentAmount(validatedAmount, method.type)
      setConfirmDialogOpen(true)
    } finally {
      setPaymentLoading(null)
    }
  }

  // Handle payment confirmation
  const handlePaymentConfirm = async () => {
    if (!selectedPaymentMethod) return

    const isPancake = isWaffoPancakePayment(selectedPaymentMethod.type)
    const success = isPancake
      ? await processWaffoPancakePayment(topupAmount)
      : await processPayment(topupAmount, selectedPaymentMethod.type)

    if (success) {
      setConfirmDialogOpen(false)
      await fetchUser()
    }
  }

  // Handle redemption
  const handleRedeem = async () => {
    if (!redemptionCode) return

    const success = await redeemCode(redemptionCode)
    if (success) {
      setRedemptionCode('')
      await fetchUser()
    }
  }

  // Handle Creem product selection
  const handleCreemProductSelect = (product: CreemProduct) => {
    setSelectedCreemProduct(product)
    setCreemDialogOpen(true)
  }

  // Handle Creem payment confirmation
  const handleCreemConfirm = async () => {
    if (!selectedCreemProduct) return

    const success = await processCreemPayment(selectedCreemProduct.productId)
    if (success) {
      setCreemDialogOpen(false)
      setSelectedCreemProduct(null)
      await fetchUser()
    }
  }

  const handleWaffoMethodSelect = async (_method: unknown, index: number) => {
    const loadingKey = `waffo-${index}`
    setPaymentLoading(loadingKey)

    try {
      await processWaffoPayment(topupAmount, index)
    } finally {
      setPaymentLoading(null)
    }
  }

  // Get discount rate for current topup amount
  const getDiscountRate = useCallback(() => {
    return topupInfo?.discount?.[topupAmount] || DEFAULT_DISCOUNT_RATE
  }, [topupInfo, topupAmount])

  const handleSubscriptionAvailabilityChange = useCallback(
    (available: boolean) => {
      setShowSubscriptionPanel(available)
    },
    []
  )

  const quickRechargeProps = {
    title: t('Quick Recharge'),
    description: t('Quick top-up, ready to use anytime'),
    topupInfo,
    presetAmounts,
    selectedPreset,
    onSelectPreset: handleSelectPreset,
    topupAmount,
    onTopupAmountChange: handleTopupAmountChange,
    paymentAmount,
    calculating,
    onPaymentMethodSelect: handlePaymentMethodSelect,
    paymentLoading,
    redemptionCode,
    onRedemptionCodeChange: setRedemptionCode,
    onRedeem: handleRedeem,
    redeeming,
    topupLink: topupInfo?.topup_link,
    loading: topupLoading,
    priceRatio: (status?.price as number) || 1,
    usdExchangeRate: effectiveUsdExchangeRate,
    onOpenBilling: () => setBillingDialogOpen(true),
    creemProducts: topupInfo?.creem_products,
    enableCreemTopup: topupInfo?.enable_creem_topup,
    onCreemProductSelect: handleCreemProductSelect,
    enableWaffoTopup: topupInfo?.enable_waffo_topup,
    waffoPayMethods: topupInfo?.waffo_pay_methods,
    waffoMinTopup: topupInfo?.waffo_min_topup,
    onWaffoMethodSelect: handleWaffoMethodSelect,
    enableWaffoPancakeTopup: topupInfo?.enable_waffo_pancake_topup,
    showBillingAction: false,
    showRedemptionSection: false,
    compact: true,
  }

  const moreServices = (
    <div className='space-y-2'>
      <h3 className='text-muted-foreground px-1 text-sm font-medium'>
        {t('More Services')}
      </h3>
      <div className='grid gap-3 sm:grid-cols-2'>
        <Card
          role='button'
          tabIndex={0}
          className='hover:bg-muted/30 cursor-pointer py-0 transition'
          onClick={() => setBillingDialogOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setBillingDialogOpen(true)
            }
          }}
        >
          <CardContent className='flex items-center gap-3 p-4'>
            <div className='bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg border'>
              <Receipt className='text-muted-foreground h-5 w-5' />
            </div>
            <div className='min-w-0 flex-1'>
              <div className='font-semibold'>{t('Order History')}</div>
              <div className='text-muted-foreground truncate text-sm'>
                {t('View subscription and recharge records')}
              </div>
            </div>
            <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
          </CardContent>
        </Card>

        <Card
          className='py-0'
          aria-disabled={topupInfo?.enable_redemption === false}
        >
          <CardContent className='space-y-3 p-4'>
            <div className='flex items-center gap-3'>
              <div className='bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg border'>
                <Gift className='text-muted-foreground h-5 w-5' />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='font-semibold'>{t('Redeem')}</div>
                <div className='text-muted-foreground truncate text-sm'>
                  {t('Use redemption code to redeem quota')}
                </div>
              </div>
            </div>
            <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'>
              <input
                value={redemptionCode}
                onChange={(event) => setRedemptionCode(event.target.value)}
                placeholder={t('Enter your redemption code')}
                className='border-input bg-background h-9 min-w-0 rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'
                disabled={topupInfo?.enable_redemption === false}
              />
              <button
                type='button'
                onClick={handleRedeem}
                disabled={
                  redeeming ||
                  !redemptionCode ||
                  topupInfo?.enable_redemption === false
                }
                className='bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-lg px-4 text-sm font-medium disabled:pointer-events-none disabled:opacity-50'
              >
                {redeeming ? t('Redeeming...') : t('Redeem')}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Wallet')}</SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t('Manage your balance and payment methods')}
        </SectionPageLayout.Description>
        <SectionPageLayout.Content>
          <div className='mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-5'>
            <div
              className={
                showSubscriptionPanel
                  ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.42fr)] xl:items-start'
                  : 'grid gap-4'
              }
            >
              <div className='flex min-w-0 flex-col gap-4 sm:gap-5'>
                <WalletStatsCard user={user} loading={userLoading} />

                {showSubscriptionPanel && (
                  <div className='xl:hidden'>
                    <SubscriptionPlansCard
                      topupInfo={topupInfo}
                      mode='summary'
                    />
                  </div>
                )}

                <SubscriptionPlansCard
                  topupInfo={topupInfo}
                  onAvailabilityChange={handleSubscriptionAvailabilityChange}
                />

                <div className='xl:hidden' id='wallet-add-funds-mobile'>
                  <RechargeFormCard {...quickRechargeProps} />
                </div>

                {moreServices}
              </div>

              {showSubscriptionPanel && (
                <div className='hidden min-w-0 flex-col gap-4 xl:flex'>
                  <SubscriptionPlansCard
                    topupInfo={topupInfo}
                    mode='summary'
                  />
                  <div id='wallet-add-funds' className='scroll-mt-4'>
                    <RechargeFormCard {...quickRechargeProps} />
                  </div>
                </div>
              )}

              {!showSubscriptionPanel && (
                <div id='wallet-add-funds' className='scroll-mt-4'>
                  <RechargeFormCard {...quickRechargeProps} />
                </div>
              )}
            </div>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <PaymentConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        onConfirm={handlePaymentConfirm}
        topupAmount={topupAmount}
        paymentAmount={paymentAmount}
        paymentMethod={selectedPaymentMethod}
        calculating={calculating}
        processing={processing || pancakeProcessing}
        discountRate={getDiscountRate()}
        usdExchangeRate={effectiveUsdExchangeRate}
      />

      <BillingHistoryDialog
        open={billingDialogOpen}
        onOpenChange={setBillingDialogOpen}
      />

      <CreemConfirmDialog
        open={creemDialogOpen}
        onOpenChange={setCreemDialogOpen}
        onConfirm={handleCreemConfirm}
        product={selectedCreemProduct}
        processing={creemProcessing}
      />
    </>
  )
}
