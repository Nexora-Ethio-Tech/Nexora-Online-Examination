import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Res,
  HttpStatus,
  HttpCode,
  Headers,
  UseGuards,
} from '@nestjs/common';
import {
  DeliveryService,
  SaveAnswersDto,
  SubmitAttemptDto,
  UploadRecoveryDto,
  DecideRecoveryDto,
  TransferDeviceDto,
} from './delivery.service';
import { Request, Response } from 'express';
import { Roles } from '../../common/guards/roles.guard';
import { DeviceBindingGuard } from '../../common/guards/device-binding.guard';

@Controller()
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Roles('student')
  @Get('me/exams')
  async getMyExams(
    @Req() req: Request,
    @Query() query: { limit?: string; cursor?: string },
  ) {
    return this.deliveryService.getMyExams(req, query);
  }

  @Roles('student')
  @Get('me/exams/:sessionId')
  async getMyExamDetail(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
  ) {
    return this.deliveryService.getMyExamDetail(req, sessionId);
  }

  @Roles('student')
  @Post('sessions/:sessionId/attempts')
  async createOrGetAttempt(
    @Req() req: Request,
    @Res() res: Response,
    @Param('sessionId') sessionId: string,
    @Body() body: { deviceId: string },
  ) {
    const result = await this.deliveryService.createOrGetAttempt(req, sessionId, body);
    return res.status(result.statusCode).json(result.data);
  }

  @Roles('student')
  @Get('attempts/:attemptId')
  async getAttempt(
    @Req() req: Request,
    @Param('attemptId') attemptId: string,
  ) {
    return this.deliveryService.getAttempt(req, attemptId);
  }

  @Roles('student')
  @Get('attempts/:attemptId/package')
  async getPackage(
    @Req() req: Request,
    @Param('attemptId') attemptId: string,
  ) {
    return this.deliveryService.getPackage(req, attemptId);
  }

  @Roles('student')
  @HttpCode(HttpStatus.OK)
  @Post('attempts/:attemptId/unlock')
  async unlockAttempt(
    @Req() req: Request,
    @Param('attemptId') attemptId: string,
    @Body()
    body: {
      packageId: string;
      examVersion: number;
      scheduleRevision: number;
      deviceGeneration: number;
    },
  ) {
    return this.deliveryService.unlockAttempt(req, attemptId, body);
  }

  @Roles('student')
  @UseGuards(DeviceBindingGuard)
  @HttpCode(HttpStatus.OK)
  @Post('attempts/:attemptId/answers')
  async saveAnswers(
    @Req() req: Request,
    @Param('attemptId') attemptId: string,
    @Body() body: SaveAnswersDto,
  ) {
    return this.deliveryService.saveAnswers(req, attemptId, body);
  }

  @Roles('student')
  @UseGuards(DeviceBindingGuard)
  @HttpCode(HttpStatus.OK)
  @Post('attempts/:attemptId/submit')
  async submitAttempt(
    @Req() req: Request,
    @Param('attemptId') attemptId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: SubmitAttemptDto,
  ) {
    return this.deliveryService.submitAttempt(req, attemptId, idempotencyKey, body);
  }

  @Roles('student')
  @Get('attempts/:attemptId/receipt')
  async getReceipt(
    @Req() req: Request,
    @Param('attemptId') attemptId: string,
  ) {
    return this.deliveryService.getReceipt(req, attemptId);
  }

  @Roles('student')
  @Post('attempts/:attemptId/recovery')
  async uploadRecovery(
    @Req() req: Request,
    @Res() res: Response,
    @Param('attemptId') attemptId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: UploadRecoveryDto,
  ) {
    const result = await this.deliveryService.uploadRecovery(req, attemptId, idempotencyKey, body);
    return res.status(result.statusCode).json(result.data);
  }

  @Roles('school_admin')
  @HttpCode(HttpStatus.OK)
  @Post('recovery/:recoveryId/decision')
  async decideRecovery(
    @Req() req: Request,
    @Param('recoveryId') recoveryId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: DecideRecoveryDto,
  ) {
    return this.deliveryService.decideRecovery(req, recoveryId, idempotencyKey, body);
  }

  @Roles('school_admin')
  @HttpCode(HttpStatus.OK)
  @Post('attempts/:attemptId/device-transfer')
  async transferDevice(
    @Req() req: Request,
    @Param('attemptId') attemptId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: TransferDeviceDto,
  ) {
    return this.deliveryService.transferDevice(req, attemptId, idempotencyKey, body);
  }
}
