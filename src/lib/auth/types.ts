/** Joint-venture login payload stored as `jointLoginData`. */

export interface AccountRole {
    accountRoleId: number;
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
    branchVO?: Record<string, unknown> | null;
    resourceList?: unknown[];
    agricTenantType?: number;
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
