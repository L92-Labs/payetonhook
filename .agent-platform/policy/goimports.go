// Parse Go boundaries without building application code or executing package init.
package main

import (
	"encoding/json"
	"fmt"
	"go/parser"
	"go/token"
	"os"
	"strconv"
	"strings"
)

type rule struct {
	ID       string   `json:"id"`
	Imports  []string `json:"imports"`
	Guidance string   `json:"guidance"`
}
type item struct {
	File   string `json:"file"`
	Source string `json:"source"`
	Rules  []rule `json:"rules"`
}
type violation struct {
	File     string `json:"file"`
	Line     int    `json:"line"`
	Rule     string `json:"rule"`
	Detail   string `json:"detail"`
	Guidance string `json:"guidance"`
}

func main() {
	var items []item
	if err := json.NewDecoder(os.Stdin).Decode(&items); err != nil {
		fail(err)
	}
	out := []violation{}
	for _, entry := range items {
		files := token.NewFileSet()
		parsed, err := parser.ParseFile(files, entry.File, entry.Source, parser.ImportsOnly)
		if err != nil {
			fail(err)
		}
		for _, imported := range parsed.Imports {
			name, err := strconv.Unquote(imported.Path.Value)
			if err != nil {
				fail(err)
			}
			for _, policy := range entry.Rules {
				for _, forbidden := range policy.Imports {
					if name == forbidden || strings.HasPrefix(name, forbidden+"/") {
						out = append(out, violation{entry.File, files.Position(imported.Pos()).Line, policy.ID, "forbidden import: " + name, policy.Guidance})
						break
					}
				}
			}
		}
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		fail(err)
	}
}

func fail(err error) { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
