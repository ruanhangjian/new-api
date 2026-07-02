package service

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const ImageAsyncActionGeneration = "images.generations"

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

func MarkStaleImageTasksFailed(timeout time.Duration, limit int) {
	if timeout <= 0 {
		return
	}
	tasks := model.GetTimedOutUnfinishedTasks(time.Now().Add(-timeout).Unix(), limit)
	for _, task := range tasks {
		if !IsImageAsyncTask(task) {
			continue
		}
		if task.Status != model.TaskStatusInProgress && task.Status != model.TaskStatusQueued && task.Status != model.TaskStatusSubmitted && task.Status != model.TaskStatusNotStart {
			continue
		}
		preStatus := task.Status
		task.Status = model.TaskStatusFailure
		task.Progress = "100%"
		task.FailReason = "image task timed out"
		task.FinishTime = time.Now().Unix()
		var data ImageAsyncTaskData
		_ = task.GetData(&data)
		data.Error = &ImageAsyncTaskError{Message: task.FailReason}
		task.SetData(data)
		_, _ = task.UpdateWithStatus(preStatus)
	}
}

func WriteImageTaskNotFound(c *gin.Context) {
	c.JSON(http.StatusNotFound, gin.H{
		"error": gin.H{
			"message": "image task not found",
			"type":    "invalid_request_error",
		},
	})
}
