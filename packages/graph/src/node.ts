import { Context } from 'cordis';

export type NodeType = 'entity' | 'identity' | 'route' | 'asset';

export interface AkariNode {
    id: string;
    type: NodeType;
    origin?: any;
    version: number;
    ctx: Context;        // 该节点专属的子上下文
    plugin: Function;    // 用于在注册表中标识该节点的匿名插件函数
}

export interface AkariEdge {
    from: string;
    to: string;
    type: 'derive' | 'link' | 'belong';
}