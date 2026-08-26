// phase-19：附件上传 hook（图片自动压缩 + 预览）
// 抽出公共逻辑供 AIChat.jsx 和 AiSidePanel.jsx 复用
//
// API:
//   const {
//     pendingFiles,     // [{ file, preview, name, type, isImage }]
//     fileInputRef,      // 绑到隐藏 <input type="file">
//     addFiles,          // (FileList | File[]) => void
//     removeFile,        // (index) => void
//     clearFiles,        // () => void
//     prepareAttachments // () => Promise<[{filename, mime, data}]>
//   } = useAttachments();

import { useState, useRef } from 'react';

async function compressImage(file, maxDim = 1920, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        if (w >= h) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else { w = Math.round((w * maxDim) / h); h = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('压缩失败'));
        resolve(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
    img.src = url;
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = () => reject(new Error('读取失败'));
    r.readAsDataURL(file);
  });
}

export function useAttachments() {
  const [pendingFiles, setPendingFiles] = useState([]);
  const fileInputRef = useRef(null);

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    const items = await Promise.all(files.map(async (f) => {
      const isImage = f.type.startsWith('image/');
      let processed = f, preview = null;
      try {
        if (isImage) {
          preview = URL.createObjectURL(f);
          const blob = await compressImage(f);
          processed = new File([blob], f.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
        }
      } catch (_) {
        // 压缩失败就用原图
      }
      return { file: processed, preview, name: f.name, type: processed.type, isImage };
    }));
    setPendingFiles((prev) => [...prev, ...items]);
  }

  function removeFile(idx) {
    setPendingFiles((prev) => {
      const item = prev[idx];
      if (item.preview?.startsWith('blob:')) URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function clearFiles() {
    setPendingFiles((prev) => {
      prev.forEach((item) => {
        if (item.preview?.startsWith('blob:')) URL.revokeObjectURL(item.preview);
      });
      return [];
    });
  }

  async function prepareAttachments() {
    const out = [];
    for (const item of pendingFiles) {
      const data = await fileToBase64(item.file);
      out.push({ filename: item.name, mime: item.type, data });
    }
    return out;
  }

  return {
    pendingFiles,
    fileInputRef,
    addFiles,
    removeFile,
    clearFiles,
    prepareAttachments,
    setPendingFiles,
  };
}
