export type Tree = {
  id: string;
  name: string;
  fileName: string;
  filePath: string;
  fileDirname: string;
  importPath: string;
  parentList: string[];
  props: {
    oneWay: string[];
    twoWay: string[];
  };
  allVariables: string[];
  error: string;
};