package service

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const (
	ImageAsyncActionGeneration = "images.generations"
	ImageAsyncActionEdit       = "images.edits"
	ImageTaskTimeoutMessage    = "生成任务已超时或因服务重启中断，请再次生成"
)

type ImageTaskPollResponse struct {
	Data ImageTaskPollData `json:"data"`
}

type ImageTaskPollData struct {
	TaskID string               `json:"task_id"`
	Status string               `json:"status"`
	Result json.RawMessage      `json:"result,omitempty"`
	Error  *ImageAsyncTaskError `json:"error,omitempty"`
}

func IsImageAsyncTask(task *model.Task) bool {
	return task != nil && task.Platform == constant.TaskPlatformImage
}

func ImageTaskPublicStatus(status model.TaskStatus) string {
	switch status {
	case model.TaskStatusQueued, model.TaskStatusSubmitted, model.TaskStatusNotStart:
		return "queued"
	case model.TaskStatusInProgress:
		return "running"
	case model.TaskStatusSuccess:
		return "completed"
	case model.TaskStatusFailure:
		return "failed"
	default:
		return "queued"
	}
}

func BuildImageTaskPollResponse(task *model.Task) (ImageTaskPollResponse, error) {
	resp := ImageTaskPollResponse{}
	resp.Data.TaskID = task.TaskID
	resp.Data.Status = ImageTaskPublicStatus(task.Status)
	var data ImageAsyncTaskData
	if len(task.Data) > 0 {
		if err := task.GetData(&data); err != nil {
			return resp, err
		}
	}
	if task.Status == model.TaskStatusSuccess {
		resp.Data.Result = data.Result
	}
	if task.Status == model.TaskStatusFailure {
		if data.Error != nil {
			resp.Data.Error = data.Error
		} else {
			resp.Data.Error = &ImageAsyncTaskError{Message: task.FailReason}
		}
	}
	return resp, nil
}

func GetOwnedImageTask(c *gin.Context, taskID string) (*model.Task, bool, error) {
	task, exists, err := model.GetByTaskId(c.GetInt("id"), taskID)
	if err != nil || !exists {
		return task, exists, err
	}
	if !IsImageAsyncTask(task) {
		return nil, false, nil
	}
	tokenID := c.GetInt("token_id")
	if task.PrivateData.TokenId > 0 && task.PrivateData.TokenId != tokenID {
		return nil, false, nil
	}
	return task, true, nil
}

func GetUserImageTask(userID int, taskID string) (*model.Task, bool, error) {
	task, exists, err := model.GetByTaskId(userID, taskID)
	if err != nil || !exists {
		return task, exists, err
	}
	if !IsImageAsyncTask(task) {
		return nil, false, nil
	}
	return task, true, nil
}

func MarkStaleImageTasksFailed(now time.Time, timeout time.Duration, limit int) int {
	if timeout <= 0 {
		return 0
	}
	tasks := model.GetTimedOutUnfinishedImageTasks(now.Add(-timeout).Unix(), limit)
	failed := 0
	for _, task := range tasks {
		if task.Status != model.TaskStatusInProgress && task.Status != model.TaskStatusQueued && task.Status != model.TaskStatusSubmitted && task.Status != model.TaskStatusNotStart {
			continue
		}
		preStatus := task.Status
		task.Status = model.TaskStatusFailure
		task.Progress = "100%"
		task.FailReason = ImageTaskTimeoutMessage
		task.FinishTime = now.Unix()
		task.UpdatedAt = task.FinishTime
		var data ImageAsyncTaskData
		_ = task.GetData(&data)
		data.Error = &ImageAsyncTaskError{Message: task.FailReason}
		task.SetData(data)
		if won, err := task.UpdateWithStatus(preStatus); err == nil && won {
			failed++
		}
	}
	return failed
}

func CleanupImageTaskRecords(now time.Time) (int64, error) {
	ttlHours := common.GetEnvOrDefault("IMAGE_WORKSHOP_TASK_TTL_HOURS", 24)
	if ttlHours <= 0 || ttlHours > 24 {
		ttlHours = 24
	}
	maxCount := common.GetEnvOrDefault("IMAGE_WORKSHOP_TASK_MAX_COUNT", 100)
	if maxCount <= 0 {
		maxCount = 100
	}
	return model.CleanupImageTasks(now.Add(-time.Duration(ttlHours)*time.Hour).Unix(), maxCount)
}

func WriteImageTaskNotFound(c *gin.Context) {
	c.JSON(http.StatusNotFound, gin.H{
		"error": gin.H{
			"message": "image task not found",
			"type":    "invalid_request_error",
		},
	})
}
