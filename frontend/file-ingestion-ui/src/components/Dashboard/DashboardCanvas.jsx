import { useLayoutEffect, useRef, useState } from "react";

import {
  COLS,
  ROW_H,
  collides,
  findFreeSpot,
  typeInfo,
} from "./Dashboardconfig";


const clamp = (value, min, max) => Math.min(Math.max(value, min), max);


export default function DashboardCanvas({
  items,
  selectedId,
  dragType,
  getTitle,
  renderBody,
  onSelect,
  onItemsChange,
  onDropType,
  onDelete,
  onDuplicate,
}) {

  const canvasRef = useRef(null);

  const [width, setWidth] = useState(0);

  // rectangle of the item being moved / resized right now
  const [live, setLive] = useState(null);

  // dashed placeholder shown while dragging from the palette
  const [ghost, setGhost] = useState(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const cellW = width / COLS;
  const cellWRef = useRef(cellW);
  cellWRef.current = cellW;


  useLayoutEffect(() => {

    const element = canvasRef.current;

    if (!element) return undefined;

    const measure = () => setWidth(element.clientWidth);

    measure();

    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();

  }, []);


  // ---------------------------------------------------------
  // Move / resize with the mouse (snaps to the grid)
  // ---------------------------------------------------------

  function startInteraction(event, item, mode) {

    event.preventDefault();
    event.stopPropagation();

    onSelect(item.id);

    const info = typeInfo(item.type);

    const start = {
      x: event.clientX,
      y: event.clientY,
      rect: { col: item.col, row: item.row, w: item.w, h: item.h },
    };

    let lastValid = null;

    function onMove(moveEvent) {

      const dCol = Math.round((moveEvent.clientX - start.x) / cellWRef.current);
      const dRow = Math.round((moveEvent.clientY - start.y) / ROW_H);

      const rect = { ...start.rect };

      if (mode === "move") {

        rect.col = clamp(start.rect.col + dCol, 0, COLS - rect.w);
        rect.row = Math.max(0, start.rect.row + dRow);

      } else {

        rect.w = clamp(start.rect.w + dCol, info.minW, COLS - rect.col);
        rect.h = Math.max(info.minH, start.rect.h + dRow);

      }

      // never drop it on top of another component
      if (!collides(rect, itemsRef.current, item.id)) {

        lastValid = rect;
        setLive({ id: item.id, ...rect });

      }

    }

    function onUp() {

      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      if (lastValid) {

        onItemsChange(
          itemsRef.current.map((i) =>
            i.id === item.id ? { ...i, ...lastValid } : i
          )
        );

      }

      setLive(null);

    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

  }


  // ---------------------------------------------------------
  // Drag a component in from the palette
  // ---------------------------------------------------------

  function spotFromEvent(event, type) {

    const info = typeInfo(type);

    const box = canvasRef.current.getBoundingClientRect();

    const col = clamp(
      Math.floor((event.clientX - box.left) / cellWRef.current),
      0,
      COLS - info.w
    );

    const row = Math.max(0, Math.floor((event.clientY - box.top) / ROW_H));

    const wanted = { col, row, w: info.w, h: info.h };

    if (!collides(wanted, itemsRef.current)) return wanted;

    return {
      ...wanted,
      ...findFreeSpot(itemsRef.current, info.w, info.h, col, row),
    };

  }

  function onDragOver(event) {

    if (!dragType) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";

    setGhost(spotFromEvent(event, dragType));

  }

  function onDragLeave(event) {

    if (!canvasRef.current.contains(event.relatedTarget)) {
      setGhost(null);
    }

  }

  function onDrop(event) {

    const type =
      event.dataTransfer.getData("application/x-viz-component") || dragType;

    if (!type) return;

    event.preventDefault();

    const spot = spotFromEvent(event, type);

    setGhost(null);

    onDropType(type, spot);

  }


  // ---------------------------------------------------------
  // Render
  // ---------------------------------------------------------

  const bottom = items.reduce((max, i) => Math.max(max, i.row + i.h), 0);

  const rows = Math.max(8, bottom + 3);

  return (
    <div className="dash-scroll" onPointerDown={() => onSelect(null)}>

      <div
        ref={canvasRef}
        className="dash-canvas"
        style={{ height: rows * ROW_H }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >

        {items.length === 0 && !ghost && (
          <div className="dash-canvas-hint">
            Drag a component from the right, or click one to add it.
          </div>
        )}

        {ghost && dragType && (
          <div
            className="dash-ghost"
            style={{
              left: ghost.col * cellW,
              top: ghost.row * ROW_H,
              width: typeInfo(dragType).w * cellW,
              height: typeInfo(dragType).h * ROW_H,
            }}
          />
        )}

        {items.map((item) => {

          const rect = live && live.id === item.id ? live : item;

          const selected = item.id === selectedId;

          return (
            <div
              key={item.id}
              className="dash-item"
              style={{
                left: rect.col * cellW,
                top: rect.row * ROW_H,
                width: rect.w * cellW,
                height: rect.h * ROW_H,
                zIndex: selected || (live && live.id === item.id) ? 2 : 1,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(item.id);
              }}
            >

              <div
                className={
                  "dash-card" +
                  (selected ? " selected" : "") +
                  (live && live.id === item.id ? " moving" : "")
                }
              >

                <div
                  className="dash-card-head"
                  onPointerDown={(e) => {
                    if (e.target.closest("button")) return;
                    startInteraction(e, item, "move");
                  }}
                >

                  <span className="dash-card-title" title={getTitle(item)}>
                    {getTitle(item)}
                  </span>

                  <span className="dash-card-actions">
                    <button
                      type="button"
                      title="Duplicate"
                      aria-label="Duplicate component"
                      onClick={() => onDuplicate(item.id)}
                    >
                      ⧉
                    </button>
                    <button
                      type="button"
                      title="Remove"
                      aria-label="Remove component"
                      onClick={() => onDelete(item.id)}
                    >
                      ×
                    </button>
                  </span>

                </div>

                <div className="dash-card-body">
                  {renderBody(item)}
                </div>

                <div
                  className="dash-resize"
                  title="Resize"
                  onPointerDown={(e) => startInteraction(e, item, "resize")}
                />

              </div>

            </div>
          );

        })}

      </div>

    </div>
  );

}