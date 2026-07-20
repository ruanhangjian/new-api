package model

import (
	"fmt"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListUserImageTasksOnlyReturnsOwnedImages(t *testing.T) {
	truncateTables(t)
	now := time.Now().Unix()
	for i, task := range []*Task{
		{TaskID: "image_new", UserId: 1, Platform: constant.TaskPlatformImage, Status: TaskStatusSuccess, SubmitTime: now},
		{TaskID: "image_old", UserId: 1, Platform: constant.TaskPlatformImage, Status: TaskStatusFailure, SubmitTime: now - 1},
		{TaskID: "other_user", UserId: 2, Platform: constant.TaskPlatformImage, Status: TaskStatusSuccess, SubmitTime: now},
		{TaskID: "video", UserId: 1, Platform: constant.TaskPlatformSuno, Status: TaskStatusSuccess, SubmitTime: now},
	} {
		task.CreatedAt = now + int64(i)
		task.UpdatedAt = task.CreatedAt
		require.NoError(t, DB.Create(task).Error)
	}

	tasks, total, err := ListUserImageTasks(1, 0, 20)
	require.NoError(t, err)
	assert.EqualValues(t, 2, total)
	require.Len(t, tasks, 2)
	assert.Equal(t, "image_old", tasks[0].TaskID)
	assert.Equal(t, "image_new", tasks[1].TaskID)
}

func TestCleanupImageTasksRemovesExpiredAndOverflowTerminalTasks(t *testing.T) {
	truncateTables(t)
	now := time.Now().Unix()
	for i := 0; i < 6; i++ {
		status := TaskStatus(TaskStatusSuccess)
		if i == 0 {
			status = TaskStatusInProgress
		}
		task := &Task{
			TaskID:     fmt.Sprintf("image_%d", i),
			UserId:     1,
			Platform:   constant.TaskPlatformImage,
			Status:     status,
			SubmitTime: now - int64(10-i),
			CreatedAt:  now + int64(i),
			UpdatedAt:  now + int64(i),
		}
		require.NoError(t, DB.Create(task).Error)
	}
	require.NoError(t, DB.Create(&Task{
		TaskID: "non_image", UserId: 1, Platform: constant.TaskPlatformSuno,
		Status: TaskStatusSuccess, SubmitTime: now - 100, CreatedAt: now, UpdatedAt: now,
	}).Error)

	deleted, err := CleanupImageTasks(now-8, 3)
	require.NoError(t, err)
	assert.EqualValues(t, 3, deleted)

	var imageTasks []Task
	require.NoError(t, DB.Where("platform = ?", constant.TaskPlatformImage).Order("id").Find(&imageTasks).Error)
	require.Len(t, imageTasks, 3)
	assert.Equal(t, TaskStatus(TaskStatusInProgress), imageTasks[0].Status)
	var nonImageCount int64
	require.NoError(t, DB.Model(&Task{}).Where("platform = ?", constant.TaskPlatformSuno).Count(&nonImageCount).Error)
	assert.EqualValues(t, 1, nonImageCount)
}
