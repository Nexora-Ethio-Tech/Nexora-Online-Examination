import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../../common/guards/session-auth.guard';
import { SkipCsrf } from '../../common/guards/csrf-origin.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @SkipCsrf()
  @Get('csrf')
  async getCsrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.getCsrf(req, res);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { loginId: string; password?: string },
  ) {
    return this.authService.login(req, res, body);
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyMfa(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { code: string },
  ) {
    return this.authService.verifyMfa(req, res, body);
  }

  @Get('me')
  async getMe(@Req() req: Request) {
    return this.authService.getMe(req);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(req, res);
  }

  @Post('device')
  @HttpCode(HttpStatus.OK)
  async registerDevice(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { deviceId: string },
  ) {
    return this.authService.registerDevice(req, res, body);
  }
}
