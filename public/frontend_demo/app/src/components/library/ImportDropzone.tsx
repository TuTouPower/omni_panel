import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FileUp } from 'lucide-react';
import { toast } from '@/components/Toast';
import { cn } from '@/lib/utils';

/**
 * ImportDropzone — (library.md §2)
 * 宽幅虚线卡片：插图 + 文案 + 支持格式 + 选择文件按钮；拖拽悬停 lime 高亮。
 */
export default function ImportDropzone() {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    toast(`已接收 ${files.length} 个文件`, 'Demo 环境 · 纯前端解析，数据不会上传');
  };

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragOver(false);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        'flex h-[132px] items-center gap-6 rounded-panel border border-dashed bg-panel px-6 transition-all duration-150',
        dragOver ? 'border-lime bg-lime-dim' : 'border-border-strong',
      )}
    >
      <img
        src="/import-illustration.svg"
        alt=""
        className={cn('h-[100px] w-auto shrink-0 transition-transform duration-150', dragOver && 'scale-105')}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[15px] font-bold text-text-primary">
          {dragOver ? '松开以导入会话文件' : '拖入会话文件，纯前端解析'}
        </p>
        <p className="text-small">数据只保留在本地浏览器，不会上传</p>
        <p className="font-mono text-[12px] text-text-muted">.jsonl&nbsp;&nbsp;.md&nbsp;&nbsp;.db&nbsp;&nbsp;.json</p>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex h-9 shrink-0 items-center gap-2 rounded-btn border px-4 text-[13px] font-medium transition-colors duration-150',
          dragOver
            ? 'border-lime bg-lime text-canvas'
            : 'border-border-strong bg-raised text-text-primary hover:border-lime hover:text-lime',
        )}
      >
        <FileUp className="h-4 w-4" />
        选择文件
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jsonl,.md,.db,.json"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </motion.div>
  );
}
