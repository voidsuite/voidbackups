package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var version = "0.1.0"

func SetVersion(v string) {
	version = v
}

var rootCmd = &cobra.Command{
	Use:   "voidbackups-agent",
	Short: "VoidBackups backup agent",
	Long:  "Lightweight backup agent for VoidBackups infrastructure backup manager.",
}

func Execute() error {
	return rootCmd.Execute()
}

func init() {
	rootCmd.AddCommand(versionCmd)
}

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print version",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("voidbackups-agent", version)
	},
}
