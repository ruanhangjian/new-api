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
import { z } from 'zod'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatTimestampForInput, parseTimestampFromInput } from '@/lib/format'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const schema = z.object({
  enabled: z.boolean(),
  rate: z.coerce.number().min(0).max(1),
  dailyCapQuota: z.coerce.number().int().min(0),
  minSettlementQuota: z.coerce.number().int().min(0),
  startTimeInput: z.string(),
  settlementHour: z.coerce.number().int().min(0).max(23),
  grayEnabled: z.boolean(),
  grayUserIds: z.string(),
})

type Values = z.infer<typeof schema>

type AffiliateRebateSettingsSectionProps = {
  defaultValues: {
    enabled: boolean
    rate: number
    dailyCapQuota: number
    minSettlementQuota: number
    startTime: number
    settlementHour: number
    grayEnabled: boolean
    grayUserIds: string
  }
}

export function AffiliateRebateSettingsSection(
  props: AffiliateRebateSettingsSectionProps
) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: {
      enabled: props.defaultValues.enabled,
      rate: props.defaultValues.rate,
      dailyCapQuota: props.defaultValues.dailyCapQuota,
      minSettlementQuota: props.defaultValues.minSettlementQuota,
      startTimeInput:
        props.defaultValues.startTime > 0
          ? formatTimestampForInput(props.defaultValues.startTime)
          : '',
      settlementHour: props.defaultValues.settlementHour,
      grayEnabled: props.defaultValues.grayEnabled,
      grayUserIds: props.defaultValues.grayUserIds,
    },
  })

  const { isDirty, isSubmitting } = form.formState
  const enabled = form.watch('enabled')
  const grayEnabled = form.watch('grayEnabled')

  async function onSubmit(values: Values) {
    const nextStartTime = parseTimestampFromInput(values.startTimeInput)
    const normalizedStartTime = nextStartTime < 0 ? 0 : nextStartTime
    const updates: Array<{ key: string; value: string }> = []

    if (values.enabled !== props.defaultValues.enabled) {
      updates.push({
        key: 'affiliate_rebate_setting.enabled',
        value: String(values.enabled),
      })
    }
    if (values.rate !== props.defaultValues.rate) {
      updates.push({
        key: 'affiliate_rebate_setting.rate',
        value: String(values.rate),
      })
    }
    if (values.dailyCapQuota !== props.defaultValues.dailyCapQuota) {
      updates.push({
        key: 'affiliate_rebate_setting.daily_cap_quota',
        value: String(values.dailyCapQuota),
      })
    }
    if (values.minSettlementQuota !== props.defaultValues.minSettlementQuota) {
      updates.push({
        key: 'affiliate_rebate_setting.min_settlement_quota',
        value: String(values.minSettlementQuota),
      })
    }
    if (normalizedStartTime !== props.defaultValues.startTime) {
      updates.push({
        key: 'affiliate_rebate_setting.start_time',
        value: String(normalizedStartTime),
      })
    }
    if (values.settlementHour !== props.defaultValues.settlementHour) {
      updates.push({
        key: 'affiliate_rebate_setting.settlement_hour',
        value: String(values.settlementHour),
      })
    }
    if (values.grayEnabled !== props.defaultValues.grayEnabled) {
      updates.push({
        key: 'affiliate_rebate_setting.gray_enabled',
        value: String(values.grayEnabled),
      })
    }
    if (values.grayUserIds !== props.defaultValues.grayUserIds) {
      updates.push({
        key: 'affiliate_rebate_setting.gray_user_ids',
        value: values.grayUserIds,
      })
    }

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }

    form.reset(values)
  }

  return (
    <SettingsSection
      title={t('Affiliate Rebate')}
      description={t('Configure continuous invitation rebate settlement')}
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          autoComplete='off'
          className='space-y-6'
        >
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                <div className='space-y-0.5'>
                  <FormLabel className='text-base'>
                    {t('Enable affiliate rebate')}
                  </FormLabel>
                  <FormDescription>
                    {t(
                      'When enabled, invited users usage will generate daily rebate for inviters.'
                    )}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={updateOption.isPending || isSubmitting}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {enabled ? (
            <div className='grid gap-6 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='rate'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Rebate rate')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        max={1}
                        step='0.0001'
                        placeholder='0.02'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Use 0.02 for a 2% rebate rate.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='dailyCapQuota'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Daily rebate cap quota')}</FormLabel>
                    <FormControl>
                      <Input type='number' min={0} step={1} {...field} />
                    </FormControl>
                    <FormDescription>
                      {t('Maximum settled rebate quota per inviter per day.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='minSettlementQuota'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Minimum settlement quota')}</FormLabel>
                    <FormControl>
                      <Input type='number' min={0} step={1} {...field} />
                    </FormControl>
                    <FormDescription>
                      {t('Single-day rebate below this quota is ignored.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='settlementHour'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Settlement hour')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        max={23}
                        step={1}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Daily settlement hour in Asia/Shanghai timezone.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='startTimeInput'
                render={({ field }) => (
                  <FormItem className='sm:col-span-2'>
                    <FormLabel>{t('Settlement start time')}</FormLabel>
                    <FormControl>
                      <Input type='datetime-local' {...field} />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Usage before this time will not be included in affiliate rebate settlement.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='grayEnabled'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4 sm:col-span-2'>
                    <div className='space-y-0.5'>
                      <FormLabel className='text-base'>
                        {t('Enable affiliate rebate gray rollout')}
                      </FormLabel>
                      <FormDescription>
                        {t(
                          'When enabled, only whitelisted user IDs can access affiliate rebate and receive settlements.'
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={updateOption.isPending || isSubmitting}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='grayUserIds'
                render={({ field }) => (
                  <FormItem className='sm:col-span-2'>
                    <FormLabel>
                      {t('Affiliate rebate whitelist user IDs')}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        rows={4}
                        placeholder={t(
                          'Enter user IDs separated by commas, spaces, or new lines'
                        )}
                        disabled={!grayEnabled}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Whitelist applies only when gray rollout is enabled; invited relationships are still recorded for other users.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ) : null}

          <Button
            type='submit'
            disabled={!isDirty || updateOption.isPending || isSubmitting}
          >
            {updateOption.isPending || isSubmitting
              ? t('Saving...')
              : t('Save affiliate rebate settings')}
          </Button>
        </form>
      </Form>
    </SettingsSection>
  )
}
