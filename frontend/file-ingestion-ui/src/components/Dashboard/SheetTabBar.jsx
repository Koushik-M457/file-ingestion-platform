import { useEffect, useRef, useState } from "react";
import "./SheetTabBar.css";

export default function SheetTabBar({
  sheets,
  activeId,
  onAdd,
  onOpen,
  onRename,
  onDuplicate,
  onMove,
  onHide,
  onDelete,
  onSetFilter,
  onSetLayout,
  onSetColors,
}) {
  const [menuId, setMenuId] = useState(null);
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [dialog, setDialog] = useState(null);

  const menuRef = useRef(null);

  const visibleSheets = sheets.filter((sheet) => !sheet.hidden);
  const activeSheet = sheets.find((sheet) => sheet.id === activeId);

  // Close the menu when clicking outside it.
  useEffect(() => {
    function closeMenu(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuId(null);
      }
    }

    document.addEventListener("mousedown", closeMenu);

    return () => {
      document.removeEventListener("mousedown", closeMenu);
    };
  }, []);

  function beginRename(sheet) {
    setRenameId(sheet.id);
    setRenameValue(sheet.name);
    setMenuId(null);
  }

  function commitRename() {
    if (renameId) {
      onRename(renameId, renameValue);
    }

    setRenameId(null);
  }

  function openDialog(type, sheet) {
    setDialog({ type, sheet });
    setMenuId(null);
  }

  function submitDialog(event) {
    event.preventDefault();

    if (!dialog) return;

    const form = new FormData(event.currentTarget);
    const sheetId = dialog.sheet.id;

    if (dialog.type === "filter") {
      const column = String(form.get("column") || "").trim();

      onSetFilter(
        sheetId,
        column
          ? {
              column,
              operator: String(
                form.get("operator") || "equals"
              ),
              value: String(form.get("value") || ""),
            }
          : null
      );
    }

    if (dialog.type === "layout") {
      onSetLayout(
        sheetId,
        String(form.get("layout") || "grid")
      );
    }

    if (dialog.type === "colors") {
      onSetColors(sheetId, {
        background: String(
          form.get("background") || "#ffffff"
        ),
        accent: String(
          form.get("accent") || "#2a78d6"
        ),
        text: String(
          form.get("text") || "#111827"
        ),
      });
    }

    setDialog(null);
  }

  return (
    <div className="dash-sheetbar">
      {/* Add sheet */}
      <button
        type="button"
        className="dash-sheet-add"
        title="Add sheet"
        aria-label="Add sheet"
        onClick={onAdd}
      >
        +
      </button>

      {/* Visible sheets */}
      <div className="dash-sheet-tabs">
        {visibleSheets.map((sheet, index) => (
          <div
            key={sheet.id}
            className={`dash-sheet-tab ${
              sheet.id === activeId ? "active" : ""
            }`}
            onClick={() => onOpen(sheet.id)}
          >
            {renameId === sheet.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(event) =>
                  setRenameValue(event.target.value)
                }
                onClick={(event) => event.stopPropagation()}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitRename();
                  }

                  if (event.key === "Escape") {
                    setRenameId(null);
                  }
                }}
                aria-label="Sheet name"
              />
            ) : (
              <span
                className="dash-sheet-name"
                title="Double-click to rename"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  beginRename(sheet);
                }}
              >
                {sheet.name}
              </span>
            )}

            {/* Three-dot menu */}
            <div
              className="dash-sheet-menu-wrap"
              ref={menuId === sheet.id ? menuRef : null}
            >
              <button
                type="button"
                className="dash-sheet-more"
                title={`Options for ${sheet.name}`}
                aria-label={`Options for ${sheet.name}`}
                onClick={(event) => {
                  event.stopPropagation();

                  setMenuId((current) =>
                    current === sheet.id ? null : sheet.id
                  );
                }}
              >
                ⋮
              </button>

              {menuId === sheet.id && (
                <div
                  className="dash-sheet-menu"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => beginRename(sheet)}
                  >
                    <span className="menu-icon">✎</span>
                    <span>Rename</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onDuplicate(sheet.id);
                      setMenuId(null);
                    }}
                  >
                    <span className="menu-icon">▢</span>
                    <span>Duplicate</span>
                  </button>

                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => {
                      onMove(sheet.id, -1);
                      setMenuId(null);
                    }}
                  >
                    <span className="menu-icon">←</span>
                    <span>Move to left</span>
                  </button>

                  <button
                    type="button"
                    disabled={index === visibleSheets.length - 1}
                    onClick={() => {
                      onMove(sheet.id, 1);
                      setMenuId(null);
                    }}
                  >
                    <span className="menu-icon">→</span>
                    <span>Move to right</span>
                  </button>

                  <button
                    type="button"
                    disabled={visibleSheets.length <= 1}
                    onClick={() => {
                      onHide(sheet.id);
                      setMenuId(null);
                    }}
                  >
                    <span className="menu-icon">◉</span>
                    <span>Hide</span>
                  </button>

                  <div className="dash-sheet-menu-separator" />

                  <button
                    type="button"
                    onClick={() => openDialog("filter", sheet)}
                  >
                    <span className="menu-icon">▽</span>
                    <span>Set filter</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openDialog("layout", sheet)}
                  >
                    <span className="menu-icon">⊞</span>
                    <span>Layout</span>
                    <span className="menu-arrow">›</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openDialog("colors", sheet)}
                  >
                    <span className="menu-icon">◉</span>
                    <span>View colors</span>
                    <span className="menu-arrow">›</span>
                  </button>

                  <div className="dash-sheet-menu-separator" />

                  <button
                    type="button"
                    className="danger"
                    disabled={sheets.length <= 1}
                    onClick={() => {
                      onDelete(sheet.id);
                      setMenuId(null);
                    }}
                  >
                    <span className="menu-icon">♲</span>
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Restore hidden sheets */}
      {sheets.some((sheet) => sheet.hidden) && (
        <details className="dash-hidden-sheets">
          <summary>
            Hidden ({sheets.filter((sheet) => sheet.hidden).length})
          </summary>

          <div className="dash-hidden-list">
            {sheets
              .filter((sheet) => sheet.hidden)
              .map((sheet) => (
                <div
                  className="dash-hidden-row"
                  key={sheet.id}
                >
                  <span>{sheet.name}</span>

                  <button
                    type="button"
                    onClick={() => onHide(sheet.id)}
                  >
                    Unhide
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpen(sheet.id)}
                  >
                    Open
                  </button>
                </div>
              ))}
          </div>
        </details>
      )}

      {/* Filter, layout and colour dialogs */}
      {dialog && (
        <div
          className="dash-sheet-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDialog(null);
            }
          }}
        >
          <form
            className="dash-sheet-dialog"
            onSubmit={submitDialog}
          >
            <div className="dash-sheet-dialog-head">
              <h3>
                {dialog.type === "filter"
                  ? "Set sheet filter"
                  : dialog.type === "layout"
                  ? "Sheet layout"
                  : "View colors"}
              </h3>

              <button
                type="button"
                aria-label="Close"
                onClick={() => setDialog(null)}
              >
                ×
              </button>
            </div>

            {dialog.type === "filter" && (
              <>
                <label>Column name</label>
                <input
                  name="column"
                  placeholder="Example: BUKRS"
                  defaultValue={dialog.sheet.filter?.column || ""}
                />

                <label>Condition</label>
                <select
                  name="operator"
                  defaultValue={
                    dialog.sheet.filter?.operator || "equals"
                  }
                >
                  <option value="equals">Equals</option>
                  <option value="contains">Contains</option>
                  <option value="greater-than">Greater than</option>
                  <option value="less-than">Less than</option>
                </select>

                <label>Value</label>
                <input
                  name="value"
                  placeholder="Filter value"
                  defaultValue={dialog.sheet.filter?.value || ""}
                />

                <p className="dash-sheet-dialog-note">
                  This saves a filter definition. Your chart query
                  logic must apply it to filter the actual data.
                </p>
              </>
            )}

            {dialog.type === "layout" && (
              <>
                <label>Layout mode</label>
                <select
                  name="layout"
                  defaultValue={dialog.sheet.layout || "grid"}
                >
                  <option value="grid">Grid canvas</option>
                  <option value="wide">Wide canvas</option>
                  <option value="compact">Compact layout</option>
                </select>
              </>
            )}

            {dialog.type === "colors" && (
              <>
                <label>Canvas background</label>
                <input
                  name="background"
                  type="color"
                  defaultValue={
                    dialog.sheet.colors?.background || "#ffffff"
                  }
                />

                <label>Accent color</label>
                <input
                  name="accent"
                  type="color"
                  defaultValue={
                    dialog.sheet.colors?.accent || "#2a78d6"
                  }
                />

                <label>Text color</label>
                <input
                  name="text"
                  type="color"
                  defaultValue={
                    dialog.sheet.colors?.text || "#111827"
                  }
                />
              </>
            )}

            <div className="dash-sheet-dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>

              <button type="submit" className="primary">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Current sheet's saved filter */}
      {activeSheet?.filter?.column && (
        <div className="dash-sheet-filter-chip">
          Filter configured: {activeSheet.filter.column}{" "}
          {activeSheet.filter.operator} “{activeSheet.filter.value}”

          <button
            type="button"
            onClick={() => onSetFilter(activeSheet.id, null)}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}