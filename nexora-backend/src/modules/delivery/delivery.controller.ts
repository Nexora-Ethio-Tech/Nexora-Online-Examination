import { OperationalService } from './operational.service';
import { RecoveryReviewService } from './recovery-review.service';
import { MonitorService } from './monitor.service';
import { SupervisionService } from './supervision.service';
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
} from './delivery.service';
import { Request, Response } from 'express';
import { Roles } from '../../common/guards/roles.guard';
import { PreparationService } from './preparation.service';
import { DeviceBindingGuard } from '../../common/guards/device-binding.guard';

@Controller()
export class DeliveryController {
  constructor(
    private readonly recoveryReview: RecoveryReviewService,
    private readonly operations: OperationalService,
    private readonly monitor: MonitorService,
    private readonly supervision: SupervisionService,
    private readonly deliveryService: DeliveryService,
    private readonly preparationService: PreparationService,
  ) {}

  @Roles('school_admin') @Get('admin/recovery') recoveryList(
    @Req() req: Request,
    @Query() query: unknown,
  ) {
    return this.recoveryReview.list(req, query);
  }
  @Roles('school_admin') @Get('admin/recovery/:id') recoveryDetail(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.recoveryReview.detail(req, id);
  }

  @Roles('student')
  @HttpCode(HttpStatus.OK)
  @Post('attempts/:attemptId/readiness')
  readiness(
    @Req() req: Request,
    @Param('attemptId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.operations.readiness(req, id, body, key);
  }
  @Roles('school_admin')
  @Get('admin/monitor/sessions')
  monitorList(@Req() req: Request, @Query() query: unknown) {
    return this.monitor.list(req, query);
  }
  @Roles('school_admin')
  @Get('admin/monitor/sessions/:id')
  monitorSitting(@Req() req: Request, @Param('id') id: string, @Query() query: unknown) {
    return this.monitor.detail(req, id, query);
  }
  @Roles('school_admin')
  @Get('admin/monitor/attempts/:id')
  monitorAttempt(@Req() req: Request, @Param('id') id: string, @Query() query: unknown) {
    return this.monitor.detail(req, id, query, true);
  }

  @Roles('student', 'school_admin')
  @Get('attempts/:attemptId/supervision')
  readSupervision(@Req() req: Request, @Param('attemptId') id: string) {
    return this.supervision.read(req, id);
  }
  @Roles('student')
  @HttpCode(HttpStatus.OK)
  @Post('attempts/:attemptId/interruptions')
  reportInterruption(@Req() req: Request, @Param('attemptId') id: string, @Body() body: unknown) {
    return this.supervision.report(req, id, body);
  }
  @Roles('school_admin')
  @HttpCode(HttpStatus.OK)
  @Post('attempts/:attemptId/supervision')
  decideSupervision(
    @Req() req: Request,
    @Param('attemptId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.supervision.decide(req, id, body, key);
  }
  @Roles('student')
  @Get('me/exams')
  async getMyExams(@Req() req: Request, @Query() query: { limit?: string; cursor?: string }) {
    return this.preparationService.getMyExams(req, query);
  }

  @Roles('student')
  @Get('me/exams/:sessionId')
  async getMyExamDetail(@Req() req: Request, @Param('sessionId') sessionId: string) {
    return this.preparationService.getMyExamDetail(req, sessionId);
  }

  @Roles('student')
  @Post('sessions/:sessionId/attempts')
  async createOrGetAttempt(
    @Req() req: Request,
    @Res() res: Response,
    @Param('sessionId') sessionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const result = await this.preparationService.createOrGetAttempt(
      req,
      sessionId,
      idempotencyKey,
      body,
    );
    return res.status(result.statusCode).json(result.data);
  }

  @Roles('student')
  @Get('attempts/:attemptId')
  async getAttempt(@Req() req: Request, @Param('attemptId') attemptId: string) {
    return this.preparationService.getAttempt(req, attemptId);
  }

  @Roles('student')
  @Get('attempts/:attemptId/package')
  async getPackage(@Req() req: Request, @Param('attemptId') attemptId: string) {
    return this.preparationService.getPackage(req, attemptId);
  }

  @Roles('student')
  @HttpCode(HttpStatus.OK)
  @Post('attempts/:attemptId/unlock')
  async unlockAttempt(
    @Req() req: Request,
    @Param('attemptId') attemptId: string,
    @Body() body: unknown,
  ) {
    return this.preparationService.unlockAttempt(req, attemptId, body);
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
  async getReceipt(@Req() req: Request, @Param('attemptId') attemptId: string) {
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
    @Body() body: unknown,
  ) {
    return this.operations.transfer(req, attemptId, body, idempotencyKey);
  }
}
