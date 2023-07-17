import * as path from 'path';
import { Tree } from './types/Tree';
import { getNonce } from './getNonce';
import * as babelParser from '@babel/parser';
import * as fs from 'fs';
import { File } from '@babel/types';
import { ImportObj } from './types/ImportObj';
import { type } from 'os';
import { isPropertyAssignment } from 'typescript';
import * as vueTemplateCompiler from 'vue-template-compiler';
import * as vueCompiler from '@vue/compiler-sfc';
// import { traverseNode, createTransformContext, transform } from '@vue/compiler-core'
import { parse, transform } from '@vue/compiler-dom';
import { DirectiveNode } from '@vue/compiler-core'
// import traverseNode from '@vue/compiler-sfc/dist/compiler-sfc.cjs';
// const traverse = require('@babel/traverse').default;
// import { parse }from '@vue/compiler-sfc';
// import { compile } from 'vue-template-compiler';

export class Parser {
  entryFile: string;
  tree: Tree | undefined;
  constructor(filePath: string) {
    // mac
    this.entryFile = filePath;    // conditionals checking if OS is windows

    // windows
    if (process.platform === 'linux' && this.entryFile.includes('wsl$')){
      // string manipulation to make sure the entryFile matches what we need for when we reference it in the
      // root definition in the parse method
      this.entryFile = path.resolve(filePath.split(path.win32.sep).join(path.posix.sep));
      this.entryFile = '/' + this.entryFile.split('/').slice(3).join('/');
    } else if (process.platform === 'linux' && /[a-zA-Z]/.test(this.entryFile[0])) {
      const root = `/mnt/${this.entryFile[0].toLowerCase()}`;
      this.entryFile = path.join(root, filePath.split(path.win32.sep).slice(1).join(path.posix.sep));
    }
    // (?) cleaning this.tree and re-setting it to undefined
    this.tree = undefined;
  }

  public entryFileParse() {
    const root = {
      id: '1',
      name: path.basename(this.entryFile).replace(/\.vue?$/, ''), // log = App
      fileName: path.basename(this.entryFile), // log = App.vue
      filePath: this.entryFile, // log = /Users/chrispark/MultiComponentVue/src/App.vue
      fileDirname: path.dirname(this.entryFile), ///Users/chrispark/MultiComponentVue/src/
      importPath: '/',
      parentList: [],
      children: [],
      props: {
        oneWay: [],
        twoWay: []
      },
      allVariables: [],
      error: ''
    };
    this.tree = root;
		// store AST that parser function creates (Array of Objects) in AST variable to send to panel.ts 
    this.parser(this.tree);
    return this.tree;
  }

	// DON'T FORGET TO CHANGE TYPES LATER AFTER TESTING IS DONE
  private parser(root: Tree): void {
    // // get the filePath
		let queue: (Tree | string)[] = [root];
    let id = root.id;
		// iterate through tree 
		while(queue.length !== 0) {
			let curr: any = queue.shift();
      if (curr === 'dead') {continue;}
			let sourceCode: string = fs.readFileSync(path.resolve(curr.filePath)).toString();
      //read sourceCode, determine if there's scrip tags, set renderMe accordingly
      //end it here if it doesn't have script tags
			const arrOfChildren = this.getChildren(sourceCode, curr.fileName, id); // 1st iteration passing in App.vue --> [HelloWorld, TheWelcome]
      // imports objects have property isUsedInTemplate set to a boolean. Could be useful later...
      const imports = this.getImports(sourceCode, curr.fileName, id); // array of objects
      // iterate through array of child components and instantiate a new ChildNode class
      for (let i = 0; i < arrOfChildren.length; i++) {
        let goodToCreateNode = false;
        const objOfVariables = this.extractVariables(sourceCode, arrOfChildren[i]);
        id = `${+id + 1}`;
        let filePath = curr.fileDirname;
        for (let j = 0; j < imports.length; j++) {
          if (imports[j].local === arrOfChildren[i]) {
            if (imports[j].source[0] !== '@') {
              if (imports[j].source.includes('.vue')) {
                filePath += imports[j].source.slice(1);
              } else {
                filePath += imports[j].source.slice(1) + '.vue';
              }
              goodToCreateNode = true;
              break;
            }
          }
        }
        if (goodToCreateNode) {
          const newFileDirname = path.dirname(filePath);
          const childSourceCode = fs.readFileSync(path.resolve(filePath)).toString();
          if (!childSourceCode.includes('script' || 'script setup')) {break;};
          const childNode = {
            id: id,
            name: arrOfChildren[i], // log = App
            fileName: `${arrOfChildren[i]}.vue`, // log = App.vue
            filePath, // log = /Users/chrispark/MultiComponentVue/src/App.vue
            fileDirname: newFileDirname, // log = /Users/chrispark/MultiComponentVue/src
            importPath: '/',
            parentList: [],
            children: [],
            props: {
              oneWay: [],
              twoWay: []
            },
            allVariables: [],
            error: ''
          };
          objOfVariables.twoway.forEach(el => {
            childNode.props.twoWay.push(el);
          });
          objOfVariables.oneway.forEach(el => {
            childNode.props.oneWay.push(el);
          });
          curr.children.push(childNode);
          queue.push(childNode);
        } else {
          queue.push('dead');
        }
      }
		}
  };

  public getTree(): Tree{
    return this.tree!;
  }

  // helper function to grab child elements
  public getChildren(sourceCode: string, filename: string, id: string): any {
    const arrOfChildren = vueCompiler.compileTemplate({ source: sourceCode, filename, id }).ast.components;
    return arrOfChildren;
  }
  // helper function to extract variables when iterating through the components
  // parse is imported from @vue/compiler-dom
  public extractVariables(template: string, component: string): any {
    const variables = {
      oneway: [],
      twoway: []
    };
    const ast = parse(template); // Parse the Vue template
    transform(ast, {
      nodeTransforms: [
        (node) => {
          if (node.hasOwnProperty('tag') && node['tag'] === component) {
            if (node.type === 1 && node.props.some((prop) => prop.type === 7 && prop.name === 'model')) {
              const twoWayDirective = node.props.find((prop) => prop.type === 7 && prop.name === 'model');
              
              try {
                variables.twoway.push(twoWayDirective['arg'].content);
              } catch(error){
                console.log("error: ", error);
              }
            } else if (node.type === 1 && node.props.some((prop) => prop.type === 7 && prop.name !== 'model')){
              const oneWayDirective = node.props.find((prop) => prop.type === 7 && prop.name !== 'model');
              try {
                variables.oneway.push(oneWayDirective['arg'].content);
              } catch(error){
                console.log("error: ", error);
              }
            }
          }
        }
      ]
    });
    return variables;
  }
  // call parse method from vueCompiler on current component. It will return an object of type SFCParseResult
  // store result in a variable and access descriptor property. 
  // We will then use this to pass into SFC compileScript as the first argument
  // second arg is options which only requires id
  // this will return an object of type SFCScriptBlock
  // store what is returned in a variable and then access the imports property
  public getImports(template: string, filename: string, id: string): any {
    if (!template.includes('script' || 'script setup')) {return [];}
    const { descriptor } = vueCompiler.parse(template, {filename}); // return object type SFCParseResult with descriptor property
    const { imports } = vueCompiler.compileScript(descriptor, {id}); // return object type SFCScriptBlock with imports property
    const result = Object.values(imports);
    return result;
  }
}

