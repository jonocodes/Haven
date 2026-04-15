//go:build wasip1

package main

import (
	"bufio"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"time"

	ntfyserver "heckel.io/ntfy/v2/server"
)

var srv *ntfyserver.Server

func init() {
	fmt.Fprintln(os.Stderr, "ntfy-wasm: init start")

	cfg := ntfyserver.NewConfig()
	cfg.BaseURL = "http://localhost"
	cfg.CacheDuration = 0
	cfg.CacheFile = ""
	cfg.AuthFile = ""
	cfg.WebPushPublicKey = ""
	cfg.AttachmentCacheDir = ""
	cfg.KeepaliveInterval = 55 * time.Second

	var err error
	srv, err = ntfyserver.New(cfg)
	if err != nil {
		log.Fatalf("ntfy-wasm: server init failed: %v", err)
	}
	fmt.Fprintln(os.Stderr, "ntfy-wasm: init done")
}

func main() {
	fmt.Fprintln(os.Stderr, "ntfy-wasm: main start")
	reader := bufio.NewReader(os.Stdin)

	req, err := http.ReadRequest(reader)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ntfy-wasm: ReadRequest error: %v\n", err)
		return
	}
	fmt.Fprintf(os.Stderr, "ntfy-wasm: handling %s %s\n", req.Method, req.URL.Path)

	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)

	result := rec.Result()
	fmt.Fprintf(os.Stderr, "ntfy-wasm: response status %d\n", result.StatusCode)

	if err := result.Write(os.Stdout); err != nil {
		fmt.Fprintf(os.Stderr, "ntfy-wasm: write response: %v\n", err)
	}
	_ = os.Stdout.Sync()
	_ = req.Body.Close()
	fmt.Fprintln(os.Stderr, "ntfy-wasm: done")
}
