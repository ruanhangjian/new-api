package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func affiliateRebateLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("CST", 8*60*60)
	}
	return loc
}

func GetAffiliateRebateOverview(c *gin.Context) {
	userId := c.GetInt("id")
	if !model.CanUseAffiliateRebate(userId) {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "no permission",
		})
		return
	}
	overview, err := model.GetAffiliateRebateOverview(userId, affiliateRebateLocation())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, overview)
}

func GetAffiliateRebateInviteeSettlements(c *gin.Context) {
	userId := c.GetInt("id")
	if !model.CanUseAffiliateRebate(userId) {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "no permission",
		})
		return
	}
	inviteeId, err := strconv.Atoi(c.Param("invitee_id"))
	if err != nil || inviteeId <= 0 {
		common.ApiErrorMsg(c, "无效的受邀用户ID")
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "7"))
	rows, err := model.GetAffiliateRebateSettlements(userId, inviteeId, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, rows)
}

func GetAffiliateRebateDailySettlements(c *gin.Context) {
	userId := c.GetInt("id")
	if !model.CanUseAffiliateRebate(userId) {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "no permission",
		})
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))
	rows, err := model.GetAffiliateRebateDailySettlements(userId, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, rows)
}
