/** 将传入的path 按照目录层级进行分层，返回双层数组 */
export function convertPathListDepth(pathList: Set<string>, cwd: string): string[][] {
  const directoriesByDepth = new Map<number, string[]>();

  for (const path of pathList) {
    if (path === cwd) {
      continue; // 外层已经处理
    }
    if (!path.startsWith(cwd)) {
      continue;
    }
    // 悬空路径校验: 父目录不存在，当前路径存在，是异常的悬空目录，不处理
    if (path !== cwd) {
      const parentPath = path.substring(0, path.lastIndexOf("/"));
      if (parentPath !== cwd && !pathList.has(parentPath)) {
        continue;
      }
    }
    const depth = path === cwd ? 0 : path.substring(cwd.length + 1).split("/").length;
    if (!directoriesByDepth.has(depth)) {
      directoriesByDepth.set(depth, []);
    }
    directoriesByDepth.get(depth)!.push(path);
  }

  // 将Map转换为按深度排序的双层数组
  const sortedDepths = Array.from(directoriesByDepth.keys()).sort((a, b) => a - b);
  return sortedDepths.map((depth) => directoriesByDepth.get(depth)!);
}
