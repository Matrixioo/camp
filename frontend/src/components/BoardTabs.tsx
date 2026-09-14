import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import type { Board } from '../types';

const DRAG_THRESHOLD_PX = 5;

interface Props {
  boards: Board[];
  selectedId: number | null;
  onSelect: (board: Board) => void;
  onCreate: (name: string) => void;
  onDelete: (board: Board) => void;
  onRename: (board: Board, name: string) => void;
  onReorder: (boards: Board[]) => void;
}

export function BoardTabs({ boards, selectedId, onSelect, onCreate, onDelete, onRename, onReorder }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Board | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const [localBoards, setLocalBoards] = useState(boards);
  const [dragId, setDragId] = useState<number | null>(null);
  const dragStartRef = useRef<{ id: number; x: number; index: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (dragId === null) setLocalBoards(boards);
  }, [boards, dragId]);

  function submitNewBoard() {
    const trimmed = name.trim();
    if (trimmed) {
      onCreate(trimmed);
    }
    setName('');
    setCreating(false);
  }

  function startRename(board: Board) {
    setEditingId(board.id);
    setEditName(board.name);
  }

  function submitRename(board: Board) {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== board.name) {
      onRename(board, trimmed);
    }
    setEditingId(null);
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const start = dragStartRef.current;
      if (!start) return;

      if (!start.moved) {
        if (Math.abs(e.clientX - start.x) < DRAG_THRESHOLD_PX) return;
        start.moved = true;
        setDragId(start.id);
      }
    }

    function handleMouseUp() {
      const start = dragStartRef.current;
      dragStartRef.current = null;
      if (!start) return;

      if (start.moved) {
        setDragId(null);
        onReorder(localBoards);
      } else {
        const board = boards.find((b) => b.id === start.id);
        if (board) onSelect(board);
      }
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localBoards, boards]);

  function handleTabMouseEnter(overIndex: number) {
    const start = dragStartRef.current;
    if (!start || !start.moved) return;

    setLocalBoards((prev) => {
      const fromIndex = prev.findIndex((b) => b.id === start.id);
      if (fromIndex === -1 || fromIndex === overIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(overIndex, 0, moved);
      return next;
    });
  }

  return (
    <nav className="board-tabs">
      {localBoards.map((board, index) => (
        <div
          key={board.id}
          className={`tab ${selectedId === board.id ? 'active' : ''} ${dragId === board.id ? 'dragging' : ''}`}
          onMouseEnter={() => handleTabMouseEnter(index)}
        >
          {editingId === board.id ? (
            <input
              autoFocus
              className="tab-rename-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename(board);
                if (e.key === 'Escape') setEditingId(null);
              }}
              onBlur={() => submitRename(board)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <button
              type="button"
              className="tab-label"
              onMouseDown={(e) => {
                dragStartRef.current = { id: board.id, x: e.clientX, index, moved: false };
              }}
              onDoubleClick={() => startRename(board)}
              title="Drag to reorder, double-click to rename"
            >
              {board.name}
            </button>
          )}
          <button
            type="button"
            className="tab-delete"
            title="Delete board"
            onClick={(e) => {
              e.stopPropagation();
              setPendingDelete(board);
            }}
          >
            ×
          </button>
        </div>
      ))}

      {creating ? (
        <input
          autoFocus
          className="tab-input"
          value={name}
          placeholder="Board name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitNewBoard();
            if (e.key === 'Escape') {
              setCreating(false);
              setName('');
            }
          }}
          onBlur={submitNewBoard}
        />
      ) : (
        <button type="button" className="tab tab-add" onClick={() => setCreating(true)}>
          + New board
        </button>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete board"
          message={`Delete board "${pendingDelete.name}" and all its rows and reservations?`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            onDelete(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </nav>
  );
}
