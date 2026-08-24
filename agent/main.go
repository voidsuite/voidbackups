package main

import (
	"fmt"
	"os"

	"github.com/voidsuite/voidbackups-agent/cmd"
)

var version = "0.1.0"

func main() {
	cmd.SetVersion(version)
	if err := cmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
