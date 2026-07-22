package service

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestImageRequestStoreStagesOpensAndRemovesRequest(t *testing.T) {
	store := &ImageRequestStore{
		RootDir:      t.TempDir(),
		TTL:          time.Hour,
		MaxBodyBytes: 1024,
	}
	body := []byte("multipart request body")
	relativePath, size, err := store.Stage("task_reference", bytes.NewReader(body))
	require.NoError(t, err)
	assert.EqualValues(t, len(body), size)
	assert.Equal(t, "inputs/task_reference/request.multipart", relativePath)

	file, err := store.Open(relativePath)
	require.NoError(t, err)
	stored, err := io.ReadAll(file)
	require.NoError(t, err)
	require.NoError(t, file.Close())
	assert.Equal(t, body, stored)

	require.NoError(t, store.RemoveTask("task_reference"))
	_, err = store.Open(relativePath)
	assert.ErrorIs(t, err, os.ErrNotExist)
}

func TestImageRequestStoreRejectsUnsafeAndOversizedRequests(t *testing.T) {
	store := &ImageRequestStore{
		RootDir:      t.TempDir(),
		TTL:          time.Hour,
		MaxBodyBytes: 3,
	}

	_, _, err := store.Stage("../unsafe", bytes.NewReader([]byte("body")))
	assert.ErrorContains(t, err, "invalid image task id")
	_, _, err = store.Stage("task_large", bytes.NewReader([]byte("body")))
	assert.ErrorContains(t, err, "exceeds 3 bytes")
	_, err = store.Open("../outside")
	assert.ErrorContains(t, err, "invalid image request path")
}

func TestImageRequestStoreCleansExpiredTaskDirectories(t *testing.T) {
	store := &ImageRequestStore{
		RootDir:      t.TempDir(),
		TTL:          time.Hour,
		MaxBodyBytes: 1024,
	}
	relativePath, _, err := store.Stage("task_expired", bytes.NewReader([]byte("body")))
	require.NoError(t, err)
	taskDir := filepath.Join(store.RootDir, "inputs", "task_expired")
	old := time.Now().Add(-2 * time.Hour)
	require.NoError(t, os.Chtimes(taskDir, old, old))

	require.NoError(t, store.CleanExpired(time.Now()))
	_, err = store.Open(relativePath)
	assert.ErrorIs(t, err, os.ErrNotExist)
}
