// Package sqlite3 stubs github.com/mattn/go-sqlite3 for WASM builds.
//
// ntfy imports go-sqlite3 as a blank import to register the "sqlite3" driver.
// With cache-duration=0, auth-file="", and no web-push configured, ntfy never
// actually opens a database connection, so we only need the type definitions
// to satisfy the compiler — no driver registration needed.
package sqlite3

// ErrNoExtended matches mattn/go-sqlite3's type used in user/manager.go.
type ErrNoExtended int

// ErrConstraintUnique is SQLITE_CONSTRAINT_UNIQUE (2067).
const ErrConstraintUnique ErrNoExtended = 2067

// Error matches mattn/go-sqlite3's Error struct.
// With auth disabled, the type assertions in user/manager.go are never reached.
type Error struct {
	Code         int
	ExtendedCode ErrNoExtended
	SystemErrno  int
	err          string
}

func (e Error) Error() string {
	if e.err != "" {
		return e.err
	}
	return "sqlite3 error"
}
