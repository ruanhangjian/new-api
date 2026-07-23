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

	failed := MarkStaleImageTasksFailed(time.Unix(now, 0), 30*time.Minute, 100)
	assert.Equal(t, 2, failed)

	var reloaded model.Task
	require.NoError(t, model.DB.Where("task_id = ?", "task_old_queued").First(&reloaded).Error)
	assert.EqualValues(t, model.TaskStatusFailure, reloaded.Status)
	assert.Equal(t, ImageTaskTimeoutMessage, reloaded.FailReason)
	var data ImageAsyncTaskData
	require.NoError(t, reloaded.GetData(&data))
	require.NotNil(t, data.Error)
	assert.Equal(t, ImageTaskTimeoutMessage, data.Error.Message)

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

func TestGetUserImageTaskRequiresOwnerAndImagePlatform(t *testing.T) {
	truncate(t)
	imageTask := &model.Task{
		TaskID:   "task_owner_image",
		UserId:   1,
		Platform: constant.TaskPlatformImage,
		Status:   model.TaskStatusSuccess,
	}
	imageTask.SetData(ImageAsyncTaskData{})
	require.NoError(t, model.DB.Create(imageTask).Error)

	otherUserTask := &model.Task{
		TaskID:   "task_other_user",
		UserId:   2,
		Platform: constant.TaskPlatformImage,
		Status:   model.TaskStatusSuccess,
	}
	otherUserTask.SetData(ImageAsyncTaskData{})
	require.NoError(t, model.DB.Create(otherUserTask).Error)

	nonImageTask := &model.Task{
		TaskID:   "task_non_image",
		UserId:   1,
		Platform: constant.TaskPlatformSuno,
		Status:   model.TaskStatusSuccess,
	}
	nonImageTask.SetData(ImageAsyncTaskData{})
	require.NoError(t, model.DB.Create(nonImageTask).Error)

	task, exists, err := GetUserImageTask(1, "task_owner_image")
	require.NoError(t, err)
	require.True(t, exists)
	assert.Equal(t, "task_owner_image", task.TaskID)

	_, exists, err = GetUserImageTask(1, "task_other_user")
	require.NoError(t, err)
	assert.False(t, exists)

	_, exists, err = GetUserImageTask(1, "task_non_image")
	require.NoError(t, err)
	assert.False(t, exists)
}
