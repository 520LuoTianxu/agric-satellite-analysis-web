/** Joint-venture login payload stored as `jointLoginData`. */

export interface AccountRole {
    accountRoleId: number;
    accountId?: number | string;
    shopName?: string;
    mainAccountFlag?: number;
    accountUsername?: string;
    accountNickname?: string;
    accountMobile?: string;
    rolesName?: string;
    virtualMobile?: string;
}

export interface CertifiedExternalSystem {
    systemType?: number;
    systemId?: string | number;
}

export interface JointLoginData {
    /** 从乡合跳转时，由登录返回的可用基地清单校验过的基地。 */
    xiangheBaseId?: string;
    agricToken?: string;
    villageToken?: string;
    bmsRefreshToken?: string;
    access_token?: string;
    refresh_token?: string;
    erpToken?: string;
    erpUser?: Record<string, unknown> | null;
    vendorName?: string;
    vendorId?: string | number;
    storeId?: string | number;
    tenantCode?: string;
    isStoreAdmin?: boolean;
    accountRoleList?: AccountRole[];
    certifiedExternalSystems?: CertifiedExternalSystem[];
    branchVO?: BranchVO | null;
    resourceList?: unknown[];
    agricTenantType?: number;
    [key: string]: unknown;
}

export interface BranchVO {
    orgId?: number | string;
    hrOrgId?: number | string;
    orgCode?: string;
    bizOrgCode?: string;
    areaOrgCode?: string;
    orgName?: string;
    hrOrgName?: string;
    hrOrgTreePath?: string;
    jobNumber?: string;
    masterJobNumber?: string;
    orgLevel?: string;
    [key: string]: unknown;
}

export interface SsoLoginData {
    userId?: number | string;
    account?: string;
    userName?: string;
    token?: string;
    refreshToken?: string;
    branchVO?: BranchVO | null;
    orgName?: string;
    hrOrgName?: string;
    orgBuVO?: { orgName?: string; hrOrgName?: string; [key: string]: unknown } | null;
    [key: string]: unknown;
}

export interface MachineLoginInfo {
    accessToken?: string;
    [key: string]: unknown;
}

export interface AuthSession {
    jointLoginData: JointLoginData;
    activeAccountRoleId: number;
    currentRole: AccountRole | null;
    tenantName: string;
}

export interface JointV2LoginParams {
    username?: string;
    password?: string;
    grant_type?: string;
    refresh_token?: string;
    accountRoleId?: number | string;
}

export class AuthApiError extends Error {
    code: string | number;
    constructor(message: string, code: string | number = "AUTH") {
        super(message);
        this.name = "AuthApiError";
        this.code = code;
    }
}
