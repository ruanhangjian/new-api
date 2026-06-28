package service

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/bytedance/gopkg/util/gopool"
)

const affiliateRebateSettlementTickInterval = 30 * time.Minute

var (
	affiliateRebateSettlementOnce    sync.Once
	affiliateRebateSettlementRunning atomic.Bool
	affiliateRebateLastSettledDate   atomic.Value
)

func StartAffiliateRebateSettlementTask() {
	affiliateRebateSettlementOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("affiliate rebate settlement task started: tick=%s", affiliateRebateSettlementTickInterval))
			ticker := time.NewTicker(affiliateRebateSettlementTickInterval)
			defer ticker.Stop()

			runAffiliateRebateSettlementOnce()
			for range ticker.C {
				runAffiliateRebateSettlementOnce()
			}
		})
	})
}

func affiliateRebateSettlementLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("CST", 8*60*60)
	}
	return loc
}

func runAffiliateRebateSettlementOnce() {
	if !affiliateRebateSettlementRunning.CompareAndSwap(false, true) {
		return
	}
	defer affiliateRebateSettlementRunning.Store(false)

	cfg := operation_setting.GetAffiliateRebateSetting()
	if !cfg.Enabled {
		return
	}

	loc := affiliateRebateSettlementLocation()
	now := time.Now().In(loc)
	settlementHour := cfg.SettlementHour
	if settlementHour < 0 {
		settlementHour = 0
	}
	if settlementHour > 23 {
		settlementHour = 23
	}
	if now.Hour() < settlementHour {
		return
	}

	targetDate := now.AddDate(0, 0, -1).Format("2006-01-02")
	if last, ok := affiliateRebateLastSettledDate.Load().(string); ok && last == targetDate {
		return
	}

	result, err := model.SettleAffiliateRebatesForDate(targetDate, loc)
	if err != nil {
		logger.LogWarn(context.Background(), fmt.Sprintf("affiliate rebate settlement failed: date=%s err=%v", targetDate, err))
		return
	}
	affiliateRebateLastSettledDate.Store(targetDate)
	if common.DebugEnabled || result.SettledCount > 0 {
		logger.LogInfo(context.Background(), fmt.Sprintf("affiliate rebate settlement finished: date=%s settled_count=%d reward_quota=%d", result.SettlementDate, result.SettledCount, result.TotalRewardQuota))
	}
}
