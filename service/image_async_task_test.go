package service

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMarkStaleImageTasksFailedMarksOldQueuedAndRunningOnly(t *testing.T) {
	truncate(t)
	now := time.Now().Unix()
	oldSubmit := now - 3600
	recentSubmit := now
	tasks := []*model.Task{
		{
			TaskID:     "task_old_queued",
			UserId:     1,
			Platform:   constant.TaskPlatformImage,
			Status:     model.TaskStatusQueued,
			Progress:   "0%",
			SubmitTime: oldSubmit,
		},
		{
			TaskID:     "task_old_running",
			UserId:     1,
			Platform:   constant.TaskPlatformImage,
			Status:     model.TaskStatusInProgress,
			Progress:   "10%",
			SubmitTime: oldSubmit,
		},
		{
			TaskID:     "task_recent_queued",
			UserId:     1,
			Platform:   constant.TaskPlatformImage,
			Status:     model.TaskStatusQueued,
			Progress:   "0%",
			SubmitTime: recentSubmit,
		},
		{
			TaskID:     "task_old_suno",
			UserId:     1,
			Platform:   constant.TaskPlatformSuno,
			Status:     model.TaskStatusQueued,
			Progress:   "0%",
			SubmitTime: oldSubmit,
		},
	}
	for _, task := range tasks {
		task.SetData(ImageAsyncTaskData{})
		require.NoError(t, model.DB.Create(task).Error)
	}

	MarkStaleImageTasksFailed(30*time.Minute, 100)

	var reloaded model.Task
	require.NoError(t, model.DB.Where("task_id = ?", "task_old_queued").First(&reloaded).Error)
	assert.EqualValues(t, model.TaskStatusFailure, reloaded.Status)
	assert.Contains(t, reloaded.FailReason, "timed out")

	reloaded = model.Task{}
	require.NoError(t, model.DB.Where("task_id = ?", "task_old_running").First(&reloaded).Error)
	assert.EqualValues(t, model.TaskStatusFailure, reloaded.Status)

	reloaded = model.Task{}
	require.NoError(t, model.DB.Where("task_id = ?", "task_recent_queued").First(&reloaded).Error)
	assert.EqualValues(t, model.TaskStatusQueued, reloaded.Status)

	reloaded = model.Task{}
	require.NoError(t, model.DB.Where("task_id = ?", "task_old_suno").First(&reloaded).Error)
	assert.EqualValues(t, model.TaskStatusQueued, reloaded.Status)
}
